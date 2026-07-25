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
    throw new GoogleIntegrationError('google_connection_required', 'Connect Google to let ShotCount continue this task.', false)
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
    throw new GoogleIntegrationError('google_rate_limited', 'Google is temporarily rate-limiting this task. ShotCount will retry.')
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
  mimeType?: string
  body?: { data?: string }
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

async function gmailCreateDraft(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
  idempotencyKey: string,
) {
  const to = (argumentsValue.to as string[]).map(safeHeader)
  const subject = safeHeader(argumentsValue.subject)
  const bodyText = String(argumentsValue.body_text ?? '').replace(/\r?\n/g, '\r\n')
  const threadId = argumentsValue.thread_id as string | null
  const reply = await replyHeaders(admin, userId, argumentsValue.in_reply_to_message_id as string | null)
  const messageIdHeader = `<${idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '.')}@shotcount.app>`
  const headers = [
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    `Message-ID: ${messageIdHeader}`,
    ...(reply.inReplyTo ? [`In-Reply-To: ${reply.inReplyTo}`] : []),
    ...(reply.references ? [`References: ${reply.references}`] : []),
  ]
  const raw = base64UrlEncode(`${headers.join('\r\n')}\r\n\r\n${bodyText}`)
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
    subject,
    body_text: bodyText,
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

async function gmailSendDraft(
  admin: AdminClient,
  userId: string,
  argumentsValue: Record<string, unknown>,
) {
  const draftId = String(argumentsValue.draft_id)
  const draft = await googleRequest<{ id?: string; message?: GmailMessage }>(
    admin,
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
  )
  if (!draft.message) throw new GoogleIntegrationError('gmail_draft_missing', 'The approved Gmail draft no longer exists.', false)
  const actualTo = normalizedEmails(headerValue(draft.message, 'To'))
  const expectedTo = (argumentsValue.expected_to as string[]).map(value => value.toLocaleLowerCase()).sort()
  const actualSubject = headerValue(draft.message, 'Subject')
  const expectedSubject = String(argumentsValue.expected_subject)
  if (JSON.stringify(actualTo) !== JSON.stringify(expectedTo) || actualSubject !== expectedSubject) {
    throw new GoogleIntegrationError('gmail_draft_changed', 'The Gmail draft changed after approval. Review it again.', false)
  }

  const messageIdHeader = headerValue(draft.message, 'Message-ID')
  if (messageIdHeader) {
    const existing = await gmailSearch(admin, userId, `in:sent rfc822msgid:${messageIdHeader}`, 1)
    const existingMessage = existing.messages[0]
    if (existingMessage?.id) {
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
  const existing = await existingCalendarEvent(
    admin,
    userId,
    calendarId,
    idempotencyKey,
    String(argumentsValue.start),
    String(argumentsValue.end),
  )
  if (existing) return { ...existing, already_created: true }

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

async function calendarUpdateEvent(admin: AdminClient, userId: string, argumentsValue: Record<string, unknown>) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(argumentsValue.calendar_id))}/events/${encodeURIComponent(String(argumentsValue.event_id))}`,
  )
  url.searchParams.set('sendUpdates', 'all')
  const patch: Record<string, unknown> = {}
  if (argumentsValue.summary !== null) patch.summary = argumentsValue.summary
  if (argumentsValue.description !== null) patch.description = argumentsValue.description
  if (argumentsValue.start !== null) {
    patch.start = { dateTime: argumentsValue.start, timeZone: argumentsValue.timezone ?? undefined }
  }
  if (argumentsValue.end !== null) {
    patch.end = { dateTime: argumentsValue.end, timeZone: argumentsValue.timezone ?? undefined }
  }
  return googleRequest<Record<string, unknown>>(admin, userId, url.toString(), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

async function calendarDeleteEvent(admin: AdminClient, userId: string, argumentsValue: Record<string, unknown>) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(argumentsValue.calendar_id))}/events/${encodeURIComponent(String(argumentsValue.event_id))}`,
  )
  url.searchParams.set('sendUpdates', argumentsValue.notify_attendees ? 'all' : 'none')
  await googleRequest<Record<string, unknown>>(admin, userId, url.toString(), { method: 'DELETE' })
  return { deleted: true, event_id: argumentsValue.event_id }
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
      const value = await calendarUpdateEvent(admin, userId, argumentsValue)
      return {
        value,
        providerActionId: String(value.id ?? argumentsValue.event_id),
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
