import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptSecret, encryptSecret } from './crypto.ts'
import {
  attachmentMetadataFromBase64,
  attachmentParts,
  attachmentsEqual,
  canonicalEmailBody,
  emailPayloadMatches,
  matchingEmailHeaderEntries,
  normalizeEmailAddress,
  normalizedEmailHeader,
  normalizedPersonName,
  type EmailAttachmentMetadata,
  type EmailPayload,
  type GmailAttachmentPart,
} from './email-integrity.ts'

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>

type GoogleIntegrationRow = {
  user_id: string
  status: string
  account_email: string
  scopes: string[]
  access_token_ciphertext: string
  refresh_token_ciphertext: string | null
  token_expires_at: string | null
}

export type GoogleToolResult = {
  value: Record<string, unknown>
  providerActionId?: string
  publicSummary: string
}

export class GoogleIntegrationError extends Error {
  code: string
  retryable: boolean

  constructor(code: string, message: string, retryable = true) {
    super(message)
    this.name = 'GoogleIntegrationError'
    this.code = code
    this.retryable = retryable
  }
}

const googleRequestTimeoutMs = 15_000
const googleTokenTimeoutMs = 12_000

export type GoogleHttpFailure = {
  code: string
  message: string
  retryable: boolean
}

/** Keep provider error policy deterministic and testable without a live Google call. */
export function classifyGoogleHttpFailure(
  status: number,
  reason = '',
): GoogleHttpFailure {
  const normalizedReason = reason.toLocaleLowerCase()
  if (status === 401) return { code: 'google_reauth_required', message: 'Reconnect Google to continue.', retryable: false }
  if (status === 403 && /(?:ratelimit|quota|user.?rate|backenderror|temporar)/i.test(normalizedReason)) {
    return { code: 'google_rate_limited', message: 'Google is temporarily rate-limiting this task. Roon will retry.', retryable: true }
  }
  if (status === 403) return { code: 'google_permission_denied', message: 'Google denied this permission. Reconnect Google or review the requested access.', retryable: false }
  if ([408, 409, 425, 429].includes(status) || status >= 500) {
    return { code: status === 429 ? 'google_rate_limited' : `google_${status}`, message: status === 429 ? 'Google is temporarily rate-limiting this task. Roon will retry.' : `Google could not complete this step (${status}). Roon will retry.`, retryable: true }
  }
  return { code: `google_${status}`, message: `Google could not complete this step (${status}).`, retryable: false }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  if (init.signal) return fetch(input, init)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GoogleIntegrationError('google_timeout', 'Google did not respond in time. Roon will retry.')
    }
    throw new GoogleIntegrationError(
      'google_network_error',
      `Google could not be reached${error instanceof Error && error.message ? `: ${error.message}` : '.'} Roon will retry.`,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export function isValidIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function calendarQueryTimestamp(value: string, timeZone: string) {
  if (!isValidIanaTimezone(timeZone)) {
    throw new GoogleIntegrationError('calendar_timezone_invalid', 'The Calendar timezone is invalid. Review the timezone before continuing.', false)
  }
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const instant = new Date(value)
    if (Number.isNaN(instant.getTime())) {
      throw new GoogleIntegrationError('calendar_timestamp_invalid', 'The Calendar timestamp is invalid.', false)
    }
    return instant.toISOString()
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
  if (!match) {
    throw new GoogleIntegrationError('calendar_timestamp_invalid', 'The Calendar timestamp must be an ISO 8601 date-time.', false)
  }
  const target = Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6] ?? 0),
    Number((match[7] ?? '').padEnd(3, '0') || 0),
  )
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  let instant = target
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]))
    const observed = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
      Number((match[7] ?? '').padEnd(3, '0') || 0),
    )
    instant += target - observed
  }
  return new Date(instant).toISOString()
}

function safeHeader(value: unknown) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function safeString(value: unknown, maximum = 10_000) {
  return typeof value === 'string' ? value.slice(0, maximum) : ''
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

export function gmailRecipientHeaderLines(to: unknown, cc: unknown = [], bcc: unknown = []) {
  const recipients = (value: unknown) => Array.isArray(value) ? value.map(safeHeader).filter(Boolean) : []
  const toValues = recipients(to)
  const ccValues = recipients(cc)
  const bccValues = recipients(bcc)
  return [
    `To: ${toValues.join(', ')}`,
    ...(ccValues.length ? [`Cc: ${ccValues.join(', ')}`] : []),
    ...(bccValues.length ? [`Bcc: ${bccValues.join(', ')}`] : []),
  ]
}

export function renderGmailMimeMessage(input: {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyText: string
  bodyHtml?: string
  messageId: string
  inReplyTo?: string | null
  references?: string | null
  idempotencyKey: string
  attachments?: Array<{ name: string; mimeType: string; base64: string }>
}) {
  const bodyText = String(input.bodyText ?? '').replace(/\r?\n/g, '\r\n')
  const bodyHtml = String(input.bodyHtml ?? '').replace(/\r?\n/g, '\r\n').trim()
  const attachments = input.attachments ?? []
  const hasHtml = Boolean(bodyHtml)
  const hasAttachments = attachments.length > 0
  const boundary = `shotcount-${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').slice(-32)}`
  const alternativeBoundary = `${boundary}-alternative`
  const alternativeBody = hasHtml
    ? [
        `--${alternativeBoundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyText,
        `--${alternativeBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyHtml,
        `--${alternativeBoundary}--`,
      ].join('\r\n')
    : [
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyText,
      ].join('\r\n')
  const headers = [
    ...gmailRecipientHeaderLines(input.to, input.cc ?? [], input.bcc ?? []),
    `Subject: ${encodeHeader(safeHeader(input.subject))}`,
    'MIME-Version: 1.0',
    hasAttachments
      ? `Content-Type: multipart/mixed; boundary="${boundary}"`
      : hasHtml
        ? `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`
        : 'Content-Type: text/plain; charset=UTF-8',
    ...(hasAttachments || hasHtml ? [] : ['Content-Transfer-Encoding: 8bit']),
    `Message-ID: ${safeHeader(input.messageId)}`,
    ...(safeHeader(input.inReplyTo) ? [`In-Reply-To: ${safeHeader(input.inReplyTo)}`] : []),
    ...(safeHeader(input.references) ? [`References: ${safeHeader(input.references)}`] : []),
  ]
  const mimeBody = hasAttachments
    ? [
        `--${boundary}`,
        ...(hasHtml
          ? [`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, '', alternativeBody]
          : alternativeBody.split('\r\n')),
        ...attachments.flatMap(attachment => [
          `--${boundary}`,
          `Content-Type: ${safeHeader(attachment.mimeType).toLocaleLowerCase() || 'application/octet-stream'}`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${safeHeader(attachment.name).replace(/"/g, '')}"`,
          '',
          safeString(attachment.base64, 12_000_000).replace(/\s+/g, '').replace(/(.{76})/g, '$1\r\n'),
        ]),
        `--${boundary}--`,
      ].join('\r\n')
    : hasHtml ? alternativeBody : bodyText
  return base64UrlEncode(`${headers.join('\r\n')}\r\n\r\n${mimeBody}`)
}

async function integrationForUser(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('agent_integrations')
    .select('user_id,status,account_email,scopes,access_token_ciphertext,refresh_token_ciphertext,token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle()
  if (error) throw new GoogleIntegrationError('google_connection_failed', error.message)
  if (!data || data.status !== 'connected') {
    throw new GoogleIntegrationError('google_connection_required', 'Connect Google to let Roon continue this task.', false)
  }
  return data as GoogleIntegrationRow
}

async function refreshAccessToken(admin: AdminClient, integration: GoogleIntegrationRow) {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret || !integration.refresh_token_ciphertext) {
    throw new GoogleIntegrationError('google_reauth_required', 'Reconnect Google to continue.', false)
  }
  const refreshToken = await decryptSecret(integration.refresh_token_ciphertext)
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  }, googleTokenTimeoutMs)
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!response.ok || !payload.access_token) {
    const needsReauth = ['invalid_grant', 'invalid_client'].includes(payload.error ?? '')
    await admin.from('agent_integrations').update({
      status: needsReauth ? 'needs_reauth' : 'error',
      last_error: safeHeader(payload.error_description || payload.error || 'Token refresh failed').slice(0, 500),
    }).eq('user_id', integration.user_id).eq('provider', 'google')
    throw new GoogleIntegrationError(
      needsReauth ? 'google_reauth_required' : 'google_refresh_failed',
      needsReauth ? 'Reconnect Google to continue.' : 'Google could not refresh access right now.',
      !needsReauth,
    )
  }
  const expiresAt = new Date(Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000).toISOString()
  const encryptedAccessToken = await encryptSecret(payload.access_token)
  await admin.from('agent_integrations').update({
    status: 'connected',
    access_token_ciphertext: encryptedAccessToken,
    token_expires_at: expiresAt,
    last_refresh_at: new Date().toISOString(),
    last_error: '',
    ...(payload.scope ? { scopes: payload.scope.split(' ').filter(Boolean) } : {}),
  }).eq('user_id', integration.user_id).eq('provider', 'google')
  return payload.access_token
}

async function accessToken(admin: AdminClient, userId: string, forceRefresh = false) {
  const integration = await integrationForUser(admin, userId)
  const expiresAt = integration.token_expires_at ? Date.parse(integration.token_expires_at) : 0
  if (!forceRefresh && expiresAt > Date.now() + 5 * 60 * 1000) {
    return decryptSecret(integration.access_token_ciphertext)
  }
  return refreshAccessToken(admin, integration)
}

async function googleRequest<T>(
  admin: AdminClient,
  userId: string,
  url: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await accessToken(admin, userId, !retry)
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  }, googleRequestTimeoutMs)
  if (response.status === 401 && retry) {
    return googleRequest(admin, userId, url, init, false)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let reason = ''
    try {
      const parsed = JSON.parse(detail) as { error?: { errors?: Array<{ reason?: string }>; status?: string } }
      reason = parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? ''
    } catch {
      // The HTTP status is still enough to classify the failure.
    }
    const failure = classifyGoogleHttpFailure(response.status, reason)
    throw new GoogleIntegrationError(failure.code, failure.message, failure.retryable)
  }
  if (response.status === 204) return {} as T
  try {
    return await response.json() as T
  } catch {
    throw new GoogleIntegrationError('google_invalid_response', 'Google returned an invalid response. Roon will retry.')
  }
}

type GmailHeader = { name?: string; value?: string }
type GmailPart = {
  filename?: string
  mimeType?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPart[]
}
type GmailMessage = {
  id?: string
  threadId?: string
  labelIds?: string[]
  historyId?: string
  internalDate?: string
  snippet?: string
  payload?: GmailPart & { headers?: GmailHeader[] }
}

type GmailDraft = {
  id?: string
  message?: GmailMessage
}

function headerValue(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(header => header.name?.toLocaleLowerCase() === name.toLocaleLowerCase())?.value ?? ''
}

function plainTextFromPart(part: GmailPart | undefined): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return base64UrlDecode(part.body.data)
  const plain = part.parts?.map(plainTextFromPart).filter(Boolean).join('\n') ?? ''
  if (plain) return plain
  if (part.mimeType === 'text/html' && part.body?.data) {
    return base64UrlDecode(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
  }
  return ''
}

function compactMessage(message: GmailMessage) {
  const attachments: Array<{ filename: string; mime_type: string; attachment_id: string; size: number }> = []
  const visit = (part: GmailPart | undefined) => {
    if (!part) return
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mime_type: part.mimeType ?? 'application/octet-stream',
        attachment_id: part.body.attachmentId,
        size: Number(part.body.size ?? 0),
      })
    }
    part.parts?.forEach(visit)
  }
  visit(message.payload)
  return {
    id: message.id ?? '',
    thread_id: message.threadId ?? '',
    history_id: message.historyId ?? '',
    labels: message.labelIds ?? [],
    from: headerValue(message, 'From'),
    to: headerValue(message, 'To'),
    cc: headerValue(message, 'Cc'),
    bcc: headerValue(message, 'Bcc'),
    subject: headerValue(message, 'Subject'),
    date: headerValue(message, 'Date'),
    auto_submitted: headerValue(message, 'Auto-Submitted'),
    precedence: headerValue(message, 'Precedence'),
    x_auto_response_suppress: headerValue(message, 'X-Auto-Response-Suppress'),
    message_id_header: headerValue(message, 'Message-ID'),
    in_reply_to: headerValue(message, 'In-Reply-To'),
    body_text: plainTextFromPart(message.payload).slice(0, 40_000),
    snippet: message.snippet ?? '',
    attachments,
  }
}

async function attachmentBase64ForPart(
  admin: AdminClient,
  userId: string,
  message: GmailMessage,
  part: GmailAttachmentPart,
) {
  if (part.body?.data) return part.body.data
  if (!part.body?.attachmentId || !message.id) return ''
  const attachment = await googleRequest<{ data?: string }>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
  )
  return attachment.data ?? ''
}

async function messageAttachmentMetadata(
  admin: AdminClient,
  userId: string,
  message: GmailMessage,
): Promise<EmailAttachmentMetadata[]> {
  const parts = attachmentParts(message.payload as GmailAttachmentPart | undefined)
  const metadata: EmailAttachmentMetadata[] = []
  for (const part of parts) {
    const encoded = await attachmentBase64ForPart(admin, userId, message, part)
    const item = await attachmentMetadataFromBase64(part.filename, part.mimeType, encoded)
    if (!item) {
      throw new GoogleIntegrationError(
        'gmail_attachment_unreadable',
        'Gmail returned an attachment that could not be verified. Review the email again.',
        false,
      )
    }
    metadata.push(item)
  }
  return metadata
}

async function emailPayloadFromMessage(
  admin: AdminClient,
  userId: string,
  message: GmailMessage,
): Promise<EmailPayload> {
  return {
    to: normalizedEmails(headerValue(message, 'To')),
    cc: normalizedEmails(headerValue(message, 'Cc')),
    bcc: normalizedEmails(headerValue(message, 'Bcc')),
    subject: headerValue(message, 'Subject'),
    body_text: canonicalEmailBody(plainTextFromPart(message.payload)),
    attachments: await messageAttachmentMetadata(admin, userId, message),
  }
}

async function attachmentMetadataFromDraftRecord(
  draftRecord: Awaited<ReturnType<typeof preparedDraftRecord>>,
): Promise<EmailAttachmentMetadata[]> {
  const argumentsValue = draftRecord?.arguments ?? {}
  const output = draftRecord?.output ?? {}
  const savedAttachments = Array.isArray(output.attachments)
    ? output.attachments
    : Array.isArray(argumentsValue.attachments)
      ? argumentsValue.attachments
      : []
  if (savedAttachments.length) {
    const metadata: EmailAttachmentMetadata[] = []
    for (const item of savedAttachments) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const value = item as Record<string, unknown>
      const encoded = safeString(value.base64, 12_000_000)
      const fromBytes = encoded
        ? await attachmentMetadataFromBase64(value.name, value.mime_type ?? value.mimeType, encoded)
        : null
      if (encoded && !fromBytes) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The saved attachment is invalid. Choose it again.', false)
      const name = safeHeader(value.name).slice(0, 160)
      const sha256 = safeString(value.sha256, 128)
      const size = Number(value.size ?? 0)
      if (fromBytes) metadata.push(fromBytes)
      else if (name && sha256 && Number.isFinite(size) && size > 0) metadata.push({ name, mime_type: safeHeader(value.mime_type ?? value.mimeType).toLocaleLowerCase() || 'application/octet-stream', size, sha256 })
      else throw new GoogleIntegrationError('gmail_attachment_metadata_missing', 'The saved attachment details are incomplete. Choose the attachment again.', false)
    }
    return metadata
  }
  const name = argumentsValue.attachment_name ?? output.attachment_name
  const mimeType = argumentsValue.attachment_mime_type ?? output.attachment_mime_type
  const base64 = argumentsValue.attachment_base64
  if (name && base64) {
    const item = await attachmentMetadataFromBase64(name, mimeType, base64)
    if (!item) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The saved attachment is invalid. Choose it again.', false)
    return [item]
  }
  const sha256 = String(argumentsValue.attachment_sha256 ?? output.attachment_sha256 ?? '')
  if (!name && !sha256) return []
  const size = Number(argumentsValue.attachment_size ?? output.attachment_size ?? 0)
  if (!name || !sha256 || !Number.isFinite(size) || size <= 0) {
    throw new GoogleIntegrationError('gmail_attachment_metadata_missing', 'The saved attachment details are incomplete. Choose the attachment again.', false)
  }
  return [{
    name: String(name),
    mime_type: String(mimeType ?? 'application/octet-stream').toLocaleLowerCase(),
    size,
    sha256,
  }]
}

async function draftExpectedPayload(
  draftRecord: Awaited<ReturnType<typeof preparedDraftRecord>>,
): Promise<EmailPayload> {
  const argumentsValue = draftRecord?.arguments ?? {}
  return {
    to: Array.isArray(argumentsValue.to) ? argumentsValue.to.map(value => String(value)) : [],
    cc: Array.isArray(argumentsValue.cc) ? argumentsValue.cc.map(value => String(value)) : [],
    bcc: Array.isArray(argumentsValue.bcc) ? argumentsValue.bcc.map(value => String(value)) : [],
    subject: String(argumentsValue.subject ?? ''),
    body_text: canonicalEmailBody(argumentsValue.body_text),
    attachments: await attachmentMetadataFromDraftRecord(draftRecord),
  }
}

async function gmailSearch(admin: AdminClient, userId: string, query: string, maxResults: number) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', String(maxResults))
  const result = await googleRequest<{ messages?: Array<{ id?: string; threadId?: string }>; resultSizeEstimate?: number }>(
    admin,
    userId,
    url.toString(),
  )
  return {
    query,
    messages: (result.messages ?? []).map(message => ({ id: message.id ?? '', thread_id: message.threadId ?? '' })),
    result_size_estimate: result.resultSizeEstimate ?? 0,
  }
}

async function gmailReadMessage(admin: AdminClient, userId: string, messageId: string) {
  const message = await googleRequest<GmailMessage>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  )
  return compactMessage(message)
}

async function gmailReadAttachments(
  admin: AdminClient,
  userId: string,
  messageId: string,
  requestedAttachmentIds: string[] = [],
) {
  const message = await googleRequest<GmailMessage>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  )
  const requested = new Set(requestedAttachmentIds.filter(Boolean))
  const parts = attachmentParts(message.payload as GmailAttachmentPart | undefined)
    .filter(part => !requested.size || requested.has(String(part.body?.attachmentId ?? '')) || requested.has(String(part.filename ?? '')))
    .slice(0, 8)
  if (requested.size && parts.length !== requested.size) {
    throw new GoogleIntegrationError('gmail_attachment_missing', 'The requested Gmail attachment is no longer available.', false)
  }
  const attachments: Array<Record<string, unknown>> = []
  let totalBytes = 0
  for (const part of parts) {
    const encoded = await attachmentBase64ForPart(admin, userId, message, part)
    if (!encoded || encoded.length > 14_000_000) {
      throw new GoogleIntegrationError('gmail_attachment_too_large', 'The Gmail attachment exceeds the safe application limit.', false)
    }
    const metadata = await attachmentMetadataFromBase64(part.filename, part.mimeType, encoded)
    if (!metadata || metadata.size > 10 * 1024 * 1024) {
      throw new GoogleIntegrationError('gmail_attachment_invalid', 'The Gmail attachment could not be verified.', false)
    }
    totalBytes += metadata.size
    if (totalBytes > 18 * 1024 * 1024) {
      throw new GoogleIntegrationError('gmail_attachment_limit', 'The Gmail attachments exceed the safe application limit.', false)
    }
    attachments.push({ ...metadata, base64: encoded })
  }
  return {
    message_id: message.id ?? messageId,
    thread_id: message.threadId ?? '',
    attachments,
  }
}

async function gmailReadThread(
  admin: AdminClient,
  userId: string,
  threadId: string,
  sentMessageId = '',
) {
  const thread = await googleRequest<{ id?: string; historyId?: string; messages?: GmailMessage[] }>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
  )
  const messages = thread.messages ?? []
  const tailStart = Math.max(0, messages.length - 30)
  const selectedIndexes = new Set<number>()
  for (let index = tailStart; index < messages.length; index += 1) selectedIndexes.add(index)
  const sentIndex = sentMessageId
    ? messages.findIndex(message => message.id === sentMessageId)
    : -1
  if (sentIndex >= 0) {
    // The first human reply can be older than the final 30 messages in a busy
    // thread. Keep the sent checkpoint plus the bounded window immediately
    // after it, which is the only portion that can satisfy this watch.
    for (let index = sentIndex; index < Math.min(messages.length, sentIndex + 31); index += 1) selectedIndexes.add(index)
  }
  return {
    id: thread.id ?? threadId,
    history_id: thread.historyId ?? '',
    // Keep the response bounded, but always retain the exact sent checkpoint
    // so a long Gmail thread cannot make Roon wait forever for a message that
    // fell out of the last-page window.
    messages: messages.filter((_, index) => selectedIndexes.has(index)).map(compactMessage),
  }
}

async function replyHeaders(
  admin: AdminClient,
  userId: string,
  gmailMessageId: string | null,
  expectedThreadId = '',
) {
  if (!gmailMessageId) return { inReplyTo: '', references: '' }
  const message = await googleRequest<GmailMessage>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
  )
  if (expectedThreadId && message.threadId !== expectedThreadId) {
    throw new GoogleIntegrationError('gmail_reply_target_invalid', 'The reply message is not part of the requested Gmail thread.', false)
  }
  const messageId = headerValue(message, 'Message-ID')
  if (!messageId) throw new GoogleIntegrationError('gmail_reply_target_invalid', 'Gmail did not return a valid reply message identity.', false)
  const references = headerValue(message, 'References')
  return {
    inReplyTo: messageId,
    references: [references, messageId].filter(Boolean).join(' ').trim(),
  }
}

export async function validateGmailReplyTarget(
  admin: AdminClient,
  userId: string,
  threadId: string,
  sentMessageId: string,
) {
  if (!threadId || !sentMessageId) {
    throw new GoogleIntegrationError('gmail_reply_target_invalid', 'A reply watch needs the exact Gmail thread and sent message.', false)
  }
  const message = await googleRequest<GmailMessage>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sentMessageId)}?format=metadata&metadataHeaders=Message-ID`,
  )
  if (!gmailReplyCheckpointMatches(message, threadId, sentMessageId)) {
    throw new GoogleIntegrationError('gmail_reply_target_invalid', 'The reply checkpoint is not a sent message in the requested Gmail thread.', false)
  }
  return { thread_id: message.threadId, sent_message_id: message.id }
}

export function gmailReplyCheckpointMatches(
  message: { id?: string; threadId?: string; labelIds?: string[] },
  threadId: string,
  sentMessageId: string,
) {
  return Boolean(
    message.id === sentMessageId &&
    message.threadId === threadId &&
    (message.labelIds ?? []).includes('SENT'),
  )
}

async function existingGmailDraft(
  admin: AdminClient,
  userId: string,
  messageIdHeader: string,
) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/drafts')
  url.searchParams.set('q', `rfc822msgid:${messageIdHeader}`)
  url.searchParams.set('maxResults', '10')
  const result = await googleRequest<{ drafts?: GmailDraft[] }>(
    admin,
    userId,
    url.toString(),
  )
  const draftId = result.drafts?.[0]?.id
  if (!draftId) return null
  return googleRequest<GmailDraft>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
  )
}

async function gmailCreateDraft(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
  idempotencyKey: string,
) {
  const to = (argumentsValue.to as string[]).map(safeHeader)
  const cc = (Array.isArray(argumentsValue.cc) ? argumentsValue.cc : []).map(safeHeader)
  const bcc = (Array.isArray(argumentsValue.bcc) ? argumentsValue.bcc : []).map(safeHeader)
  const subject = safeHeader(argumentsValue.subject)
  const bodyText = String(argumentsValue.body_text ?? '').replace(/\r?\n/g, '\r\n')
  const bodyHtml = safeString(argumentsValue.body_html, 30_000).replace(/\r?\n/g, '\r\n').trim()
  const threadId = argumentsValue.thread_id as string | null
  const inReplyToMessageId = argumentsValue.in_reply_to_message_id as string | null
  if (Boolean(threadId) !== Boolean(inReplyToMessageId)) {
    throw new GoogleIntegrationError('gmail_reply_target_invalid', 'A reply must include both its Gmail thread and the message it answers.', false)
  }
  const reply = await replyHeaders(admin, userId, inReplyToMessageId, threadId ?? '')
  const messageIdHeader = `<${idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '.')}@shotcount.app>`
  const existingDraft = await existingGmailDraft(admin, userId, messageIdHeader)
  if (existingDraft?.id && existingDraft.message) {
    const existingMessage = compactMessage(existingDraft.message)
    const existingAttachments = await messageAttachmentMetadata(admin, userId, existingDraft.message)
    const firstAttachment = existingAttachments[0]
    return {
      draft_id: existingDraft.id,
      message_id: existingDraft.message.id ?? '',
      thread_id: existingDraft.message.threadId ?? threadId ?? '',
      // Gmail may replace a caller-supplied Message-ID while persisting a
      // draft. Keep the canonical header Gmail returned so the later send
      // verification does not mistake that normal provider behavior for a
      // user edit.
      message_id_header: headerValue(existingDraft.message, 'Message-ID') || messageIdHeader,
      to: normalizedEmails(existingMessage.to),
      cc: normalizedEmails(existingMessage.cc),
      bcc: normalizedEmails(existingMessage.bcc),
      subject: existingMessage.subject,
      body_text: existingMessage.body_text,
      ...(existingAttachments.length ? { attachments: existingAttachments } : {}),
      ...(firstAttachment ? {
        attachment_name: firstAttachment.name,
        attachment_mime_type: firstAttachment.mime_type,
        attachment_size: firstAttachment.size,
        attachment_sha256: firstAttachment.sha256,
      } : {}),
      already_created: true,
    }
  }
  const rawAttachments = Array.isArray(argumentsValue.attachments) ? argumentsValue.attachments : []
  if (rawAttachments.length > 8) throw new GoogleIntegrationError('gmail_attachment_limit', 'An email may include at most eight controlled attachments.', false)
  const attachments: Array<{ metadata: EmailAttachmentMetadata; base64: string }> = []
  for (const item of rawAttachments) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The email attachment metadata is invalid.', false)
    const value = item as Record<string, unknown>
    const name = safeHeader(value.name).replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 160)
    const mimeType = safeHeader(value.mime_type ?? value.mimeType).toLocaleLowerCase().slice(0, 160) || 'application/octet-stream'
    const base64 = safeString(value.base64, 12_000_000).replace(/\s+/g, '')
    const metadata = await attachmentMetadataFromBase64(name, mimeType, base64)
    if (!metadata) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The email attachment is too large or invalid.', false)
    attachments.push({ metadata, base64 })
  }
  const legacyAttachmentName = safeHeader(argumentsValue.benchmark_attachment_name)
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .slice(0, 160)
  const legacyAttachmentBase64 = String(argumentsValue.benchmark_attachment_base64 ?? '').replace(/\s+/g, '')
  const legacyAttachment = legacyAttachmentName && legacyAttachmentBase64 && legacyAttachmentBase64.length <= 1_400_000
    ? await attachmentMetadataFromBase64(legacyAttachmentName, 'application/pdf', legacyAttachmentBase64)
    : null
  if (legacyAttachmentName && !legacyAttachment) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The attachment is too large or invalid.', false)
  if (legacyAttachment) attachments.push({ metadata: legacyAttachment, base64: legacyAttachmentBase64 })
  if (attachments.length > 8) throw new GoogleIntegrationError('gmail_attachment_limit', 'An email may include at most eight controlled attachments.', false)
  const hasAttachments = attachments.length > 0
  const raw = renderGmailMimeMessage({
    to,
    cc,
    bcc,
    subject,
    bodyText,
    bodyHtml,
    messageId: messageIdHeader,
    inReplyTo: reply.inReplyTo,
    references: reply.references,
    idempotencyKey,
    attachments: attachments.map(attachment => ({ name: attachment.metadata.name, mimeType: attachment.metadata.mime_type, base64: attachment.base64 })),
  })
  const draft = await googleRequest<{ id?: string; message?: GmailMessage }>(
    admin,
    userId,
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    {
      method: 'POST',
      body: JSON.stringify({
        message: {
          raw,
          ...(threadId ? { threadId } : {}),
        },
      }),
    },
  )
  if (!draft.id) throw new GoogleIntegrationError('gmail_draft_missing', 'Gmail did not return a draft ID.')
  return {
    draft_id: draft.id,
    message_id: draft.message?.id ?? '',
    thread_id: draft.message?.threadId ?? threadId ?? '',
    message_id_header: (draft.message ? headerValue(draft.message, 'Message-ID') : '') || messageIdHeader,
    to,
    cc,
    bcc,
    subject,
    body_text: bodyText,
    ...(bodyHtml ? { body_html: bodyHtml } : {}),
    ...(attachments.length ? {
      attachments: attachments.map(attachment => attachment.metadata),
      ...(attachments.length === 1 ? {
        attachment_name: attachments[0]!.metadata.name,
        attachment_mime_type: attachments[0]!.metadata.mime_type,
        attachment_size: attachments[0]!.metadata.size,
        attachment_sha256: attachments[0]!.metadata.sha256,
      } : {}),
    } : {}),
    already_created: false,
  }
}

export async function updatePreparedGmailDraft(
  admin: AdminClient,
  userId: string,
  draftId: string,
  subjectValue: string,
  bodyValue: string,
  attachment: { name: string; base64: string; mimeType: string } = { name: '', base64: '', mimeType: '' },
) {
  const draftRecord = await preparedDraftRecord(admin, userId, draftId)
  if (!draftRecord?.arguments || !draftRecord.output) {
    throw new GoogleIntegrationError('gmail_draft_record_missing', 'The prepared Gmail draft is no longer available.', false)
  }
  const to = (draftRecord.arguments.to as string[]).map(safeHeader)
  const cc = (Array.isArray(draftRecord.arguments.cc) ? draftRecord.arguments.cc : []).map(safeHeader)
  const bcc = (Array.isArray(draftRecord.arguments.bcc) ? draftRecord.arguments.bcc : []).map(safeHeader)
  const subject = safeHeader(subjectValue).trim()
  const bodyText = String(bodyValue ?? '').trim().replace(/\r?\n/g, '\r\n')
  if (!subject) throw new GoogleIntegrationError('gmail_subject_required', 'Add an email subject before sending.', false)
  if (!bodyText) throw new GoogleIntegrationError('gmail_body_required', 'Add an email body before sending.', false)
  const threadId = draftRecord.arguments.thread_id as string | null
  const currentDraft = await googleRequest<GmailDraft>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
  )
  if (!currentDraft.message) throw new GoogleIntegrationError('gmail_draft_missing', 'The prepared Gmail draft no longer exists.', false)
  const reply = await replyHeaders(admin, userId, draftRecord.arguments.in_reply_to_message_id as string | null, threadId ?? '')
  const messageIdHeader = safeHeader(draftRecord.output.message_id_header)
  const savedAttachments = await attachmentMetadataFromDraftRecord(draftRecord)
  let attachmentName = safeHeader(attachment.name).replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 160)
  let attachmentBase64 = attachment.base64.replace(/\s+/g, '')
  let attachmentMimeType = safeHeader(attachment.mimeType).toLocaleLowerCase().slice(0, 160)
  let attachmentMetadata: EmailAttachmentMetadata | null = null
  if (attachment.name || attachment.base64) {
    attachmentMetadata = await attachmentMetadataFromBase64(attachmentName, attachmentMimeType, attachmentBase64)
    if (!attachmentMetadata) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The attachment is too large or invalid.', false)
    attachmentName = attachmentMetadata.name
    attachmentMimeType = attachmentMetadata.mime_type
  } else if (savedAttachments.length) {
    const currentParts = attachmentParts(currentDraft.message.payload as GmailAttachmentPart | undefined)
    const currentAttachments = await messageAttachmentMetadata(admin, userId, currentDraft.message)
    if (!attachmentsEqual(savedAttachments, currentAttachments) || currentParts.length !== savedAttachments.length) {
      throw new GoogleIntegrationError('gmail_attachment_changed', 'The saved Gmail attachment changed. Choose it again before saving this edit.', false)
    }
    if (currentParts.length !== 1) {
      throw new GoogleIntegrationError('gmail_attachment_unsupported', 'This email has more than one attachment. Review it in Gmail before sending.', false)
    }
    attachmentName = safeHeader(currentParts[0].filename).replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 160)
    attachmentMimeType = safeHeader(currentParts[0].mimeType).toLocaleLowerCase().slice(0, 160) || 'application/octet-stream'
    attachmentBase64 = await attachmentBase64ForPart(admin, userId, currentDraft.message, currentParts[0])
    attachmentMetadata = await attachmentMetadataFromBase64(attachmentName, attachmentMimeType, attachmentBase64)
    if (!attachmentMetadata || !attachmentsEqual(savedAttachments, [attachmentMetadata])) {
      throw new GoogleIntegrationError('gmail_attachment_changed', 'The saved Gmail attachment could not be verified. Choose it again before saving this edit.', false)
    }
  } else if (attachmentParts(currentDraft.message.payload as GmailAttachmentPart | undefined).length) {
    throw new GoogleIntegrationError('gmail_attachment_changed', 'This Gmail draft has an attachment that was added outside ShotCount. Review the email again before saving this edit.', false)
  }
  const hasAttachment = Boolean(attachmentMetadata)
  const boundary = `shotcount-${draftId.replace(/[^a-zA-Z0-9]/g, '').slice(-32)}`
  const headers = [
    ...gmailRecipientHeaderLines(to, cc, bcc),
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    hasAttachment ? `Content-Type: multipart/mixed; boundary="${boundary}"` : 'Content-Type: text/plain; charset=UTF-8',
    ...(hasAttachment ? [] : ['Content-Transfer-Encoding: 8bit']),
    ...(messageIdHeader ? [`Message-ID: ${messageIdHeader}`] : []),
    ...(reply.inReplyTo ? [`In-Reply-To: ${reply.inReplyTo}`] : []),
    ...(reply.references ? [`References: ${reply.references}`] : []),
  ]
  const mimeBody = hasAttachment ? [
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', bodyText,
    `--${boundary}`, `Content-Type: ${attachmentMimeType || 'application/octet-stream'}`,
    'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${attachmentName}"`, '', attachmentBase64,
    `--${boundary}--`,
  ].join('\r\n') : bodyText
  const raw = base64UrlEncode(`${headers.join('\r\n')}\r\n\r\n${mimeBody}`)
  const updated = await googleRequest<GmailDraft>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        id: draftId,
        message: {
          raw,
          ...(threadId ? { threadId } : {}),
        },
      }),
    },
  )
  if (!updated.id || !updated.message) {
    throw new GoogleIntegrationError('gmail_draft_update_unconfirmed', 'Gmail did not confirm the draft update.')
  }
  return {
    draft_id: updated.id,
    message_id: updated.message.id ?? '',
    thread_id: updated.message.threadId ?? threadId ?? '',
    message_id_header: headerValue(updated.message, 'Message-ID') || messageIdHeader,
    to,
    cc,
    bcc,
    subject,
    body_text: bodyText,
    ...(attachmentMetadata ? {
      attachment_name: attachmentMetadata.name,
      attachment_mime_type: attachmentMetadata.mime_type,
      attachment_size: attachmentMetadata.size,
      attachment_sha256: attachmentMetadata.sha256,
    } : {}),
    already_created: true,
  }
}

function normalizedEmails(value: string) {
  return normalizedEmailHeader(value)
}

async function preparedDraftRecord(
  admin: AdminClient,
  userId: string,
  draftId: string,
) {
  const { data, error } = await admin
    .from('agent_actions')
    .select('arguments,output')
    .eq('user_id', userId)
    .eq('tool_name', 'gmail.create_draft')
    .eq('status', 'succeeded')
    .eq('output->>draft_id', draftId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw new GoogleIntegrationError(
      'gmail_draft_record_failed',
      'Roon could not verify the prepared Gmail draft.',
    )
  }
  return data as {
    arguments?: Record<string, unknown>
    output?: Record<string, unknown>
  } | null
}

async function sentMessageForPreparedDraft(
  admin: AdminClient,
  userId: string,
  draftRecord: Awaited<ReturnType<typeof preparedDraftRecord>>,
) {
  const messageIdHeader = String(draftRecord?.output?.message_id_header ?? '')
  if (!messageIdHeader) return null
  const existing = await gmailSearch(
    admin,
    userId,
    `in:sent rfc822msgid:${messageIdHeader}`,
    1,
  )
  const messageId = existing.messages[0]?.id
  if (!messageId) return null
  return googleRequest<GmailMessage>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  )
}

export function hasConfirmedSentMessage(value: { id?: string } | null | undefined) {
  return Boolean(value?.id)
}

async function gmailSendDraft(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
) {
  const draftId = String(argumentsValue.draft_id)
  const draftRecord = await preparedDraftRecord(admin, userId, draftId)
  if (!draftRecord?.arguments || !draftRecord.output) {
    throw new GoogleIntegrationError(
      'gmail_draft_record_missing',
      'The prepared Gmail draft is no longer available. Prepare it again.',
      false,
    )
  }
  const alreadySent = await sentMessageForPreparedDraft(admin, userId, draftRecord)
  const expectedPayload = await draftExpectedPayload(draftRecord)
  if (alreadySent?.id) {
    const sentPayload = await emailPayloadFromMessage(admin, userId, alreadySent)
    if (!emailPayloadMatches(expectedPayload, sentPayload)) {
      throw new GoogleIntegrationError('gmail_sent_message_mismatch', 'A message with this send identity already exists, but its content does not match the approved email. Review it before continuing.', false)
    }
    return {
      message_id: alreadySent.id,
      thread_id: alreadySent.threadId ?? '',
      already_sent: true,
    }
  }

  let draft: GmailDraft
  try {
    draft = await googleRequest<GmailDraft>(
      admin,
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
    )
  } catch (error) {
    if (error instanceof GoogleIntegrationError && error.code === 'google_404') {
      throw new GoogleIntegrationError('gmail_send_verification_pending', 'Gmail may have accepted this email, but its final sent copy is not visible yet. Roon will verify it before retrying.', true)
    }
    throw error
  }
  if (!draft.message) throw new GoogleIntegrationError('gmail_draft_missing', 'The approved Gmail draft no longer exists.', false)
  const draftPayload = await emailPayloadFromMessage(admin, userId, draft.message)
  const approvedPayload: EmailPayload = {
    ...expectedPayload,
    to: Array.isArray(argumentsValue.expected_to) ? argumentsValue.expected_to.map(value => String(value)) : [],
    cc: Array.isArray(argumentsValue.expected_cc) ? argumentsValue.expected_cc.map(value => String(value)) : [],
    bcc: Array.isArray(argumentsValue.expected_bcc) ? argumentsValue.expected_bcc.map(value => String(value)) : [],
    subject: String(argumentsValue.expected_subject ?? ''),
  }
  // Gmail assigns or rewrites Message-ID headers when it persists a draft.
  // The exact Gmail draft ID plus the approved payload are the authoritative
  // identity checks; comparing the provider's rewritten header would reject a
  // valid send as if the draft had been edited.
  if (
    !emailPayloadMatches(expectedPayload, draftPayload) ||
    !emailPayloadMatches(approvedPayload, draftPayload)
  ) {
    throw new GoogleIntegrationError('gmail_draft_changed', 'The Gmail draft changed after approval. Review it again.', false)
  }

  const existingAfterValidation = await sentMessageForPreparedDraft(admin, userId, draftRecord)
  if (existingAfterValidation?.id) {
    const sentPayload = await emailPayloadFromMessage(admin, userId, existingAfterValidation)
    if (!emailPayloadMatches(expectedPayload, sentPayload)) {
      throw new GoogleIntegrationError('gmail_sent_message_mismatch', 'A message with this send identity already exists, but its content does not match the approved email. Review it before continuing.', false)
    }
    if (hasConfirmedSentMessage(existingAfterValidation)) {
      return {
        message_id: existingAfterValidation.id,
        thread_id: existingAfterValidation.threadId ?? '',
        already_sent: true,
      }
    }
  }

  const sent = await googleRequest<GmailMessage>(
    admin,
    userId,
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send',
    { method: 'POST', body: JSON.stringify({ id: draftId }) },
  )
  if (!sent.id) throw new GoogleIntegrationError('gmail_send_unconfirmed', 'Gmail did not confirm that the email was sent.')
  let confirmedSent: GmailMessage
  try {
    confirmedSent = await googleRequest<GmailMessage>(
      admin,
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sent.id)}?format=full`,
    )
  } catch {
    throw new GoogleIntegrationError('gmail_send_verification_pending', 'Gmail accepted the email, but its final sent copy is not visible yet. Roon will verify it before retrying.', true)
  }
  const confirmedPayload = await emailPayloadFromMessage(admin, userId, confirmedSent)
  if (!emailPayloadMatches(expectedPayload, confirmedPayload) || !emailPayloadMatches(approvedPayload, confirmedPayload)) {
    throw new GoogleIntegrationError('gmail_sent_message_mismatch', 'Gmail returned a sent message that does not match the approved email. The message was not marked complete.', false)
  }
  return {
    message_id: confirmedSent.id,
    thread_id: confirmedSent.threadId ?? '',
    history_id: confirmedSent.historyId ?? '',
    already_sent: false,
  }
}

export async function deletePreparedGmailDraft(
  admin: AdminClient,
  userId: string,
  draftId: string,
) {
  if (!draftId) return { deleted: false, already_deleted: true }
  try {
    const draftRecord = await preparedDraftRecord(admin, userId, draftId)
    if (!draftRecord?.output) return { deleted: false, already_deleted: true }
    const draft = await googleRequest<GmailDraft>(
      admin,
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
    )
    await googleRequest<Record<string, unknown>>(
      admin,
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
      { method: 'DELETE' },
    )
    return { deleted: true, already_deleted: false }
  } catch (error) {
    if (error instanceof GoogleIntegrationError && error.code === 'google_404') {
      return { deleted: false, already_deleted: true }
    }
    throw error
  }
}

// Kept as a compatibility export for the benchmark-only caller. The deletion
// path is identity-checked and is safe for both benchmark and live drafts.
export async function deleteGoogleBenchmarkDraft(
  admin: AdminClient,
  userId: string,
  draftId: string,
) {
  return deletePreparedGmailDraft(admin, userId, draftId)
}

async function calendarListEvents(admin: AdminClient, userId: string, argumentsValue: Record<string, unknown>) {
  const calendarId = encodeURIComponent(String(argumentsValue.calendar_id))
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`)
  url.searchParams.set('timeMin', String(argumentsValue.time_min))
  url.searchParams.set('timeMax', String(argumentsValue.time_max))
  url.searchParams.set('maxResults', String(argumentsValue.max_results))
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  const result = await googleRequest<{ items?: Record<string, unknown>[] }>(admin, userId, url.toString())
  return { events: result.items ?? [] }
}

async function calendarAvailability(admin: AdminClient, userId: string, argumentsValue: Record<string, unknown>) {
  const timezone = String(argumentsValue.timezone)
  return googleRequest<Record<string, unknown>>(
    admin,
    userId,
    'https://www.googleapis.com/calendar/v3/freeBusy',
    {
      method: 'POST',
      body: JSON.stringify({
        timeMin: calendarQueryTimestamp(String(argumentsValue.time_min), timezone),
        timeMax: calendarQueryTimestamp(String(argumentsValue.time_max), timezone),
        timeZone: timezone,
        items: (argumentsValue.calendar_ids as string[]).map(id => ({ id })),
      }),
    },
  )
}

type GoogleCalendarEvent = {
  id?: string
  summary?: string
  description?: string
  status?: string
  transparency?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email?: string; responseStatus?: string }>
  extendedProperties?: { private?: Record<string, string> }
}

export function calendarEventBlocksTime(
  event: GoogleCalendarEvent,
  excludedEventId = '',
) {
  return Boolean(
    event.id &&
    event.id !== excludedEventId &&
    event.status !== 'cancelled' &&
    event.transparency !== 'transparent'
  )
}

async function calendarEvent(
  admin: AdminClient,
  userId: string,
  calendarId: string,
  eventId: string,
) {
  try {
    return await googleRequest<GoogleCalendarEvent>(
      admin,
      userId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    )
  } catch (error) {
    if (
      error instanceof GoogleIntegrationError &&
      ['google_404', 'google_410'].includes(error.code)
    ) return null
    throw error
  }
}

async function blockingCalendarEvents(
  admin: AdminClient,
  userId: string,
  calendarId: string,
  start: string,
  end: string,
  excludedEventId = '',
) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  )
  url.searchParams.set('timeMin', start)
  url.searchParams.set('timeMax', end)
  url.searchParams.set('maxResults', '250')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('showDeleted', 'false')
  const events: GoogleCalendarEvent[] = []
  for (let page = 0; page < 5; page += 1) {
    const result = await googleRequest<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(
      admin,
      userId,
      url.toString(),
    )
    events.push(...(result.items ?? []))
    if (!result.nextPageToken) break
    if (page === 4) {
      throw new GoogleIntegrationError(
        'calendar_conflict_check_incomplete',
        'Calendar returned too many events to verify this time safely. Review the window before continuing.',
        false,
      )
    }
    url.searchParams.set('pageToken', result.nextPageToken)
  }
  return events.filter(event => calendarEventBlocksTime(event, excludedEventId))
}

async function assertCalendarWindowAvailable(
  admin: AdminClient,
  userId: string,
  calendarId: string,
  start: string,
  end: string,
  excludedEventId = '',
) {
  const conflicts = await blockingCalendarEvents(
    admin,
    userId,
    calendarId,
    start,
    end,
    excludedEventId,
  )
  if (conflicts.length) {
    throw new GoogleIntegrationError(
      'calendar_conflict',
      'That time is no longer available. Review another conflict-free time.',
      false,
    )
  }
}

async function existingCalendarEvent(
  admin: AdminClient,
  userId: string,
  calendarId: string,
  idempotencyKey: string,
  start: string,
  end: string,
) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('privateExtendedProperty', `shotcount_idempotency_key=${idempotencyKey}`)
  url.searchParams.set('timeMin', start)
  url.searchParams.set('timeMax', end)
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('singleEvents', 'true')
  const result = await googleRequest<{ items?: Array<Record<string, unknown>> }>(admin, userId, url.toString())
  return result.items?.[0]
}

async function calendarCreateEvent(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const calendarId = String(argumentsValue.calendar_id)
  const timezone = String(argumentsValue.timezone)
  const queryStart = calendarQueryTimestamp(String(argumentsValue.start), timezone)
  const queryEnd = calendarQueryTimestamp(String(argumentsValue.end), timezone)
  const existing = await existingCalendarEvent(
    admin,
    userId,
    calendarId,
    idempotencyKey,
    queryStart,
    queryEnd,
  )
  if (existing) return { ...existing, already_created: true }

  await assertCalendarWindowAvailable(
    admin,
    userId,
    calendarId,
    queryStart,
    queryEnd,
  )

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('sendUpdates', argumentsValue.notify_attendees === false ? 'none' : 'all')
  if (argumentsValue.add_google_meet) url.searchParams.set('conferenceDataVersion', '1')
  const event = await googleRequest<Record<string, unknown>>(admin, userId, url.toString(), {
    method: 'POST',
    body: JSON.stringify({
      summary: argumentsValue.summary,
      description: argumentsValue.description,
      start: { dateTime: queryStart, timeZone: timezone },
      end: { dateTime: queryEnd, timeZone: timezone },
      attendees: (argumentsValue.attendee_emails as string[]).map(email => ({ email })),
      extendedProperties: { private: { shotcount_idempotency_key: idempotencyKey } },
      ...(argumentsValue.add_google_meet
        ? { conferenceData: { createRequest: { requestId: idempotencyKey.slice(0, 120) } } }
        : {}),
    }),
  })
  return { ...event, already_created: false }
}

async function calendarUpdateEvent(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
  idempotencyKey: string,
) {
  const calendarId = String(argumentsValue.calendar_id)
  const eventId = String(argumentsValue.event_id)
  const current = await calendarEvent(admin, userId, calendarId, eventId)
  if (!current) {
    throw new GoogleIntegrationError(
      'calendar_event_missing',
      'That Calendar event no longer exists. Review the task before trying again.',
      false,
    )
  }
  if (
    current.extendedProperties?.private?.shotcount_idempotency_key === idempotencyKey
  ) {
    return { ...current, already_updated: true }
  }

  const effectiveStart = argumentsValue.start === null
    ? current.start?.dateTime ?? ''
    : String(argumentsValue.start)
  const effectiveEnd = argumentsValue.end === null
    ? current.end?.dateTime ?? ''
    : String(argumentsValue.end)
  const effectiveTimezone = String(
    argumentsValue.timezone ?? current.start?.timeZone ?? current.end?.timeZone ?? 'UTC',
  )
  if ((argumentsValue.start !== null || argumentsValue.end !== null) && (!effectiveStart || !effectiveEnd)) {
    throw new GoogleIntegrationError(
      'calendar_event_time_missing',
      'The existing event time could not be verified.',
      false,
    )
  }
  if (argumentsValue.start !== null || argumentsValue.end !== null) {
    await assertCalendarWindowAvailable(
      admin,
      userId,
      calendarId,
      calendarQueryTimestamp(effectiveStart, effectiveTimezone),
      calendarQueryTimestamp(effectiveEnd, effectiveTimezone),
      eventId,
    )
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  )
  url.searchParams.set('sendUpdates', argumentsValue.notify_attendees === false ? 'none' : 'all')
  const patch: Record<string, unknown> = {
    extendedProperties: {
      private: {
        ...(current.extendedProperties?.private ?? {}),
        shotcount_idempotency_key: idempotencyKey,
      },
    },
  }
  if (argumentsValue.summary !== null) patch.summary = argumentsValue.summary
  if (argumentsValue.description !== null) patch.description = argumentsValue.description
  if (argumentsValue.start !== null) {
    patch.start = { dateTime: calendarQueryTimestamp(String(argumentsValue.start), effectiveTimezone), timeZone: effectiveTimezone }
  }
  if (argumentsValue.end !== null) {
    patch.end = { dateTime: calendarQueryTimestamp(String(argumentsValue.end), effectiveTimezone), timeZone: effectiveTimezone }
  }
  const updated = await googleRequest<Record<string, unknown>>(admin, userId, url.toString(), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return {
    ...updated,
    already_updated: false,
    shotcount_previous_event: {
      summary: current.summary ?? '',
      description: current.description ?? '',
      start: current.start ?? null,
      end: current.end ?? null,
      attendee_emails: (current.attendees ?? []).map(attendee => attendee.email).filter(Boolean),
    },
  }
}

async function calendarDeleteEvent(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
) {
  const calendarId = String(argumentsValue.calendar_id)
  const eventId = String(argumentsValue.event_id)
  const existing = await calendarEvent(admin, userId, calendarId, eventId)
  if (!existing) {
    return { deleted: true, event_id: eventId, already_deleted: true }
  }
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  )
  url.searchParams.set('sendUpdates', argumentsValue.notify_attendees ? 'all' : 'none')
  await googleRequest<Record<string, unknown>>(admin, userId, url.toString(), { method: 'DELETE' })
  return { deleted: true, event_id: eventId, already_deleted: false }
}

async function contactsFind(admin: AdminClient, userId: string, argumentsValue: Record<string, unknown>) {
  const base = 'https://people.googleapis.com/v1/people:searchContacts'
  const warmup = new URL(base)
  warmup.searchParams.set('query', '')
  warmup.searchParams.set('readMask', 'names,emailAddresses')
  warmup.searchParams.set('pageSize', '10')
  await googleRequest<Record<string, unknown>>(admin, userId, warmup.toString())
  const url = new URL(base)
  url.searchParams.set('query', String(argumentsValue.query))
  url.searchParams.set('readMask', 'names,emailAddresses')
  url.searchParams.set('pageSize', String(argumentsValue.max_results))
  const result = await googleRequest<{
    results?: Array<{
      person?: {
        resourceName?: string
        names?: Array<{ displayName?: string }>
        emailAddresses?: Array<{ value?: string }>
      }
    }>
  }>(admin, userId, url.toString())
  return {
    contacts: (result.results ?? []).map(item => ({
      resource_name: item.person?.resourceName ?? '',
      name: item.person?.names?.[0]?.displayName ?? '',
      emails: (item.person?.emailAddresses ?? []).map(email => email.value).filter(Boolean),
    })),
  }
}

function recipientEmail(value: string) {
  return normalizeEmailAddress(value)
}

async function gmailRecipientHeaderMatches(
  admin: AdminClient,
  userId: string,
  query: string,
) {
  // Gmail's from:/to: operators constrain this lookup to message headers. We
  // deliberately do not use message bodies as recipient identity evidence.
  const searches = await Promise.all([
    gmailSearch(admin, userId, `from:"${query.replaceAll('"', '')}"`, 50),
    gmailSearch(admin, userId, `in:sent to:"${query.replaceAll('"', '')}"`, 50),
  ])
  const seen = new Set<string>()
  const matches: Array<{ email: string; name: string; thread_id: string; evidence: string }> = []
  const candidates = searches.flatMap(search => search.messages).filter(message => {
    if (!message.id || seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const batch = candidates.slice(offset, offset + 8)
    const messages = await Promise.all(batch.map(async message => ({
      source: message,
      value: await googleRequest<GmailMessage>(
        admin,
        userId,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(message.id))}?format=metadata&metadataHeaders=From&metadataHeaders=To`,
      ),
    })))
    for (const { source, value: gmailMessage } of messages) {
      for (const [header, evidence] of [[headerValue(gmailMessage, 'From'), 'gmail_from_header'], [headerValue(gmailMessage, 'To'), 'gmail_sent_to_header']] as const) {
        for (const entry of matchingEmailHeaderEntries(header, query)) {
          matches.push({ email: entry.email, name: entry.name || query, thread_id: source.thread_id, evidence })
        }
      }
    }
  }
  return matches
}

async function resolveRecipient(admin: AdminClient, userId: string, recipient: string) {
  const explicit = recipientEmail(recipient)
  if (explicit) return { state: 'explicit', recipient: explicit, email: explicit, evidence: 'task_explicit_email', candidates: [] }
  const query = recipient.trim()
  try {
    const contactResult = await contactsFind(admin, userId, { query, max_results: 10 })
    const exactContacts = contactResult.contacts.filter(contact =>
      normalizedPersonName(String(contact.name ?? '')) === normalizedPersonName(query),
    )
    const contactCandidates = exactContacts.flatMap(contact =>
      (Array.isArray(contact.emails) ? contact.emails : []).map(email => ({
        email: recipientEmail(String(email)), name: String(contact.name ?? query), thread_id: '', evidence: 'google_contact',
      })).filter(candidate => candidate.email),
    )
    const uniqueContacts = [...new Map(contactCandidates.map(candidate => [candidate.email, candidate])).values()]
    if (uniqueContacts.length === 1) {
      const candidate = uniqueContacts[0]
      return { state: 'resolved_single', recipient: query, email: candidate.email, evidence: candidate.evidence, thread_id: '', candidates: uniqueContacts }
    }
    if (uniqueContacts.length > 1) {
      return { state: 'ambiguous', recipient: query, candidates: uniqueContacts }
    }
    const headerCandidates = await gmailRecipientHeaderMatches(admin, userId, query)
    const uniqueHeaders = [...new Map(headerCandidates.map(candidate => [candidate.email, candidate])).values()]
    if (uniqueHeaders.length === 1) {
      const candidate = uniqueHeaders[0]
      return { state: 'resolved_single', recipient: query, email: candidate.email, evidence: candidate.evidence, thread_id: candidate.thread_id, candidates: uniqueHeaders }
    }
    if (uniqueHeaders.length > 1) return { state: 'ambiguous', recipient: query, candidates: uniqueHeaders }
    return { state: 'not_found', recipient: query, candidates: [] }
  } catch (error) {
    if (error instanceof GoogleIntegrationError) {
      return { state: 'provider_unavailable', recipient: query, candidates: [], provider_error_code: error.code }
    }
    throw error
  }
}

export async function executeGoogleTool(
  admin: AdminClient,
  userId: string,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  idempotencyKey: string,
): Promise<GoogleToolResult> {
  switch (toolName) {
    case 'gmail.search_messages': {
      const value = await gmailSearch(admin, userId, String(argumentsValue.query), Number(argumentsValue.max_results))
      return { value, publicSummary: `Found ${value.messages.length} relevant Gmail messages.` }
    }
    case 'gmail.read_message': {
      const value = await gmailReadMessage(admin, userId, String(argumentsValue.message_id))
      return { value, providerActionId: value.id, publicSummary: 'Read the relevant Gmail message.' }
    }
    case 'gmail.read_attachments': {
      const attachmentIds = Array.isArray(argumentsValue.attachment_ids)
        ? argumentsValue.attachment_ids.map(value => safeString(value, 256)).filter(Boolean)
        : []
      const value = await gmailReadAttachments(admin, userId, String(argumentsValue.message_id), attachmentIds)
      return { value, providerActionId: value.message_id, publicSummary: `Read ${value.attachments.length} Gmail attachment(s).` }
    }
    case 'gmail.read_thread': {
      const value = await gmailReadThread(
        admin,
        userId,
        String(argumentsValue.thread_id),
        safeString(argumentsValue.sent_message_id, 256),
      )
      return { value, providerActionId: value.id, publicSummary: 'Read the relevant Gmail thread.' }
    }
    case 'gmail.create_draft': {
      const value = await gmailCreateDraft(admin, userId, argumentsValue, idempotencyKey)
      return { value, providerActionId: value.draft_id, publicSummary: 'Prepared a Gmail draft for review.' }
    }
    case 'gmail.send_message': {
      const value = await gmailSendDraft(admin, userId, argumentsValue)
      return { value, providerActionId: value.message_id, publicSummary: 'Gmail confirmed the email was sent.' }
    }
    case 'contacts.find_contact': {
      const value = await contactsFind(admin, userId, argumentsValue)
      return { value, publicSummary: `Found ${value.contacts.length} matching contacts.` }
    }
    case 'contacts.resolve_recipient': {
      const value = await resolveRecipient(admin, userId, String(argumentsValue.recipient))
      const state = String(value.state).replaceAll('_', ' ')
      return { value, publicSummary: `Recipient resolution: ${state}.` }
    }
    case 'calendar.list_events': {
      const value = await calendarListEvents(admin, userId, argumentsValue)
      return { value, publicSummary: `Checked ${value.events.length} calendar events.` }
    }
    case 'calendar.get_availability': {
      const value = await calendarAvailability(admin, userId, argumentsValue)
      return { value, publicSummary: 'Checked calendar availability.' }
    }
    case 'calendar.create_event': {
      const value = await calendarCreateEvent(admin, userId, argumentsValue, idempotencyKey)
      return {
        value,
        providerActionId: String(value.id ?? ''),
        publicSummary: 'Google Calendar confirmed the event was created.',
      }
    }
    case 'calendar.update_event': {
      const value = await calendarUpdateEvent(admin, userId, argumentsValue, idempotencyKey)
      return {
        value,
        providerActionId: String(argumentsValue.event_id),
        publicSummary: 'Google Calendar confirmed the event was updated.',
      }
    }
    case 'calendar.delete_event': {
      const value = await calendarDeleteEvent(admin, userId, argumentsValue)
      return {
        value,
        providerActionId: String(argumentsValue.event_id),
        publicSummary: 'Google Calendar confirmed the event was cancelled.',
      }
    }
    default:
      throw new GoogleIntegrationError('google_tool_unknown', `Unknown Google tool: ${toolName}`, false)
  }
}
