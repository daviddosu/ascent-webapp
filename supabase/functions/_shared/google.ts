import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptSecret, encryptSecret } from './crypto.ts'

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

export function calendarQueryTimestamp(value: string, timeZone: string) {
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return new Date(value).toISOString()
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
  if (!match) return value
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
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const payload = await response.json() as {
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
  const response = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (response.status === 401 && retry) {
    return googleRequest(admin, userId, url, init, false)
  }
  if (response.status === 401 || response.status === 403) {
    throw new GoogleIntegrationError('google_reauth_required', 'Reconnect Google to continue.', false)
  }
  if (response.status === 429) {
    throw new GoogleIntegrationError('google_rate_limited', 'Google is temporarily rate-limiting this task. Roon will retry.')
  }
  if (!response.ok) {
    const detail = await response.text()
    throw new GoogleIntegrationError(
      `google_${response.status}`,
      `Google could not complete this step (${response.status}).`,
      response.status >= 500,
    )
  }
  if (response.status === 204) return {} as T
  return response.json() as Promise<T>
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
    subject: headerValue(message, 'Subject'),
    date: headerValue(message, 'Date'),
    message_id_header: headerValue(message, 'Message-ID'),
    in_reply_to: headerValue(message, 'In-Reply-To'),
    body_text: plainTextFromPart(message.payload).slice(0, 40_000),
    snippet: message.snippet ?? '',
    attachments,
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

async function gmailReadThread(admin: AdminClient, userId: string, threadId: string) {
  const thread = await googleRequest<{ id?: string; historyId?: string; messages?: GmailMessage[] }>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
  )
  return {
    id: thread.id ?? threadId,
    history_id: thread.historyId ?? '',
    messages: (thread.messages ?? []).slice(-30).map(compactMessage),
  }
}

async function replyHeaders(
  admin: AdminClient,
  userId: string,
  gmailMessageId: string | null,
) {
  if (!gmailMessageId) return { inReplyTo: '', references: '' }
  const message = await googleRequest<GmailMessage>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
  )
  const messageId = headerValue(message, 'Message-ID')
  const references = headerValue(message, 'References')
  return {
    inReplyTo: messageId,
    references: [references, messageId].filter(Boolean).join(' ').trim(),
  }
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
  const threadId = argumentsValue.thread_id as string | null
  const reply = await replyHeaders(admin, userId, argumentsValue.in_reply_to_message_id as string | null)
  const messageIdHeader = `<${idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '.')}@shotcount.app>`
  const existingDraft = await existingGmailDraft(admin, userId, messageIdHeader)
  if (existingDraft?.id && existingDraft.message) {
    const existingMessage = compactMessage(existingDraft.message)
    return {
      draft_id: existingDraft.id,
      message_id: existingDraft.message.id ?? '',
      thread_id: existingDraft.message.threadId ?? threadId ?? '',
      message_id_header: messageIdHeader,
      to: normalizedEmails(existingMessage.to),
      cc,
      bcc,
      subject: existingMessage.subject,
      body_text: existingMessage.body_text,
      already_created: true,
    }
  }
  const attachmentName = safeHeader(argumentsValue.benchmark_attachment_name)
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .slice(0, 160)
  const attachmentBase64 = String(argumentsValue.benchmark_attachment_base64 ?? '')
  const hasBenchmarkAttachment = Boolean(attachmentName && attachmentBase64 && attachmentBase64.length <= 1_400_000)
  const boundary = `shotcount-${idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').slice(-32)}`
  const headers = [
    `To: ${to.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    ...(bcc.length ? [`Bcc: ${bcc.join(', ')}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    hasBenchmarkAttachment
      ? `Content-Type: multipart/mixed; boundary="${boundary}"`
      : 'Content-Type: text/plain; charset=UTF-8',
    ...(hasBenchmarkAttachment ? [] : ['Content-Transfer-Encoding: 8bit']),
    `Message-ID: ${messageIdHeader}`,
    ...(reply.inReplyTo ? [`In-Reply-To: ${reply.inReplyTo}`] : []),
    ...(reply.references ? [`References: ${reply.references}`] : []),
  ]
  const mimeBody = hasBenchmarkAttachment
    ? [
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyText,
        `--${boundary}`,
        'Content-Type: application/pdf',
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachmentName}"`,
        '',
        attachmentBase64.replace(/\s+/g, '').replace(/(.{76})/g, '$1\r\n'),
        `--${boundary}--`,
      ].join('\r\n')
    : bodyText
  const raw = base64UrlEncode(`${headers.join('\r\n')}\r\n\r\n${mimeBody}`)
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
    message_id_header: messageIdHeader,
    to,
    cc,
    bcc,
    subject,
    body_text: bodyText,
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
  const subject = safeHeader(subjectValue).trim()
  const bodyText = String(bodyValue ?? '').trim().replace(/\r?\n/g, '\r\n')
  if (!subject) throw new GoogleIntegrationError('gmail_subject_required', 'Add an email subject before sending.', false)
  if (!bodyText) throw new GoogleIntegrationError('gmail_body_required', 'Add an email body before sending.', false)
  const threadId = draftRecord.arguments.thread_id as string | null
  const reply = await replyHeaders(admin, userId, draftRecord.arguments.in_reply_to_message_id as string | null)
  const messageIdHeader = safeHeader(draftRecord.output.message_id_header)
  const attachmentName = safeHeader(attachment.name).replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 160)
  const attachmentBase64 = attachment.base64.replace(/\s+/g, '')
  const hasAttachment = Boolean(attachmentName && attachmentBase64 && attachmentBase64.length <= 1_400_000)
  if (attachment.name && !hasAttachment) throw new GoogleIntegrationError('gmail_attachment_invalid', 'The attachment is too large or invalid.', false)
  const boundary = `shotcount-${draftId.replace(/[^a-zA-Z0-9]/g, '').slice(-32)}`
  const headers = [
    `To: ${to.join(', ')}`,
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
    `--${boundary}`, `Content-Type: ${safeHeader(attachment.mimeType) || 'application/octet-stream'}`,
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
    message_id_header: messageIdHeader,
    to,
    subject,
    body_text: bodyText,
    attachment_name: attachmentName || null,
    already_created: true,
  }
}

function normalizedEmails(value: string) {
  return value
    .split(',')
    .map(item => item.match(/<([^>]+)>/)?.[1] ?? item)
    .map(item => item.trim().toLocaleLowerCase())
    .filter(Boolean)
    .sort()
}

function canonicalEmailBody(value: unknown) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
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
  return existing.messages[0] ?? null
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
  if (alreadySent?.id) {
    return {
      message_id: alreadySent.id,
      thread_id: alreadySent.thread_id,
      already_sent: true,
    }
  }

  const draft = await googleRequest<{ id?: string; message?: GmailMessage }>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
  )
  if (!draft.message) throw new GoogleIntegrationError('gmail_draft_missing', 'The approved Gmail draft no longer exists.', false)
  const actualTo = normalizedEmails(headerValue(draft.message, 'To'))
  const actualCc = normalizedEmails(headerValue(draft.message, 'Cc'))
  const actualBcc = normalizedEmails(headerValue(draft.message, 'Bcc'))
  const expectedTo = (argumentsValue.expected_to as string[]).map(value => value.toLocaleLowerCase()).sort()
  const expectedCc = (argumentsValue.expected_cc as string[] ?? []).map(value => value.toLocaleLowerCase()).sort()
  const expectedBcc = (argumentsValue.expected_bcc as string[] ?? []).map(value => value.toLocaleLowerCase()).sort()
  const actualSubject = headerValue(draft.message, 'Subject')
  const expectedSubject = String(argumentsValue.expected_subject)
  const preparedBody = canonicalEmailBody(draftRecord.arguments.body_text)
  const actualBody = canonicalEmailBody(plainTextFromPart(draft.message.payload))
  if (
    JSON.stringify(actualTo) !== JSON.stringify(expectedTo) ||
    JSON.stringify(actualCc) !== JSON.stringify(expectedCc) ||
    JSON.stringify(actualBcc) !== JSON.stringify(expectedBcc) ||
    actualSubject !== expectedSubject ||
    actualBody !== preparedBody
  ) {
    throw new GoogleIntegrationError('gmail_draft_changed', 'The Gmail draft changed after approval. Review it again.', false)
  }

  const messageIdHeader = headerValue(draft.message, 'Message-ID')
  if (messageIdHeader) {
    const existing = await gmailSearch(admin, userId, `in:sent rfc822msgid:${messageIdHeader}`, 1)
    const existingMessage = existing.messages[0]
    if (hasConfirmedSentMessage(existingMessage)) {
      return {
        message_id: existingMessage.id,
        thread_id: existingMessage.thread_id,
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
  return {
    message_id: sent.id,
    thread_id: sent.threadId ?? '',
    history_id: sent.historyId ?? '',
    already_sent: false,
  }
}

export async function deleteGoogleBenchmarkDraft(
  admin: AdminClient,
  userId: string,
  draftId: string,
) {
  if (!draftId) return { deleted: false, already_deleted: true }
  try {
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
  return googleRequest<Record<string, unknown>>(
    admin,
    userId,
    'https://www.googleapis.com/calendar/v3/freeBusy',
    {
      method: 'POST',
      body: JSON.stringify({
        timeMin: argumentsValue.time_min,
        timeMax: argumentsValue.time_max,
        timeZone: argumentsValue.timezone,
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
  url.searchParams.set('maxResults', '20')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('showDeleted', 'false')
  const result = await googleRequest<{ items?: GoogleCalendarEvent[] }>(
    admin,
    userId,
    url.toString(),
  )
  return (result.items ?? []).filter(event =>
    calendarEventBlocksTime(event, excludedEventId)
  )
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
  url.searchParams.set('sendUpdates', 'all')
  if (argumentsValue.add_google_meet) url.searchParams.set('conferenceDataVersion', '1')
  const event = await googleRequest<Record<string, unknown>>(admin, userId, url.toString(), {
    method: 'POST',
    body: JSON.stringify({
      summary: argumentsValue.summary,
      description: argumentsValue.description,
      start: { dateTime: argumentsValue.start, timeZone: argumentsValue.timezone },
      end: { dateTime: argumentsValue.end, timeZone: argumentsValue.timezone },
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
      effectiveStart,
      effectiveEnd,
      eventId,
    )
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  )
  url.searchParams.set('sendUpdates', 'all')
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
    patch.start = { dateTime: argumentsValue.start, timeZone: argumentsValue.timezone ?? undefined }
  }
  if (argumentsValue.end !== null) {
    patch.end = { dateTime: argumentsValue.end, timeZone: argumentsValue.timezone ?? undefined }
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
  const match = value.match(/<([^>\s]+@[^>\s]+)>/)?.[1] ?? value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(match) ? match.toLocaleLowerCase() : ''
}

function normalizedPersonName(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

async function gmailRecipientHeaderMatches(
  admin: AdminClient,
  userId: string,
  query: string,
) {
  // Gmail's from:/to: operators constrain this lookup to message headers. We
  // deliberately do not use message bodies as recipient identity evidence.
  const searches = await Promise.all([
    gmailSearch(admin, userId, `from:"${query.replaceAll('"', '')}"`, 10),
    gmailSearch(admin, userId, `in:sent to:"${query.replaceAll('"', '')}"`, 10),
  ])
  const seen = new Set<string>()
  const matches: Array<{ email: string; name: string; thread_id: string; evidence: string }> = []
  for (const search of searches) {
    for (const message of search.messages) {
      if (!message.id || seen.has(message.id)) continue
      seen.add(message.id)
      const gmailMessage = await googleRequest<GmailMessage>(
        admin,
        userId,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To`,
      )
      for (const [header, evidence] of [[headerValue(gmailMessage, 'From'), 'gmail_from_header'], [headerValue(gmailMessage, 'To'), 'gmail_sent_to_header']] as const) {
        const email = recipientEmail(header)
        if (!email || !normalizedPersonName(header).includes(normalizedPersonName(query))) continue
        matches.push({ email, name: header.replace(/<[^>]+>/, '').trim() || query, thread_id: message.thread_id, evidence })
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
    case 'gmail.read_thread': {
      const value = await gmailReadThread(admin, userId, String(argumentsValue.thread_id))
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
