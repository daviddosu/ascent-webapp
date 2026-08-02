export type ParsedEmailAddress = {
  email: string
  name: string
  raw: string
}

export type EmailAttachmentMetadata = {
  name: string
  mime_type: string
  size: number
  sha256: string
}

export type EmailPayload = {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body_text: string
  attachments?: EmailAttachmentMetadata[]
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmailAddress(value: unknown) {
  const text = String(value ?? '').trim()
  const bracketed = text.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1]
  const candidate = (bracketed ?? text).replace(/^['"]|['"]$/g, '').trim().toLocaleLowerCase()
  return emailPattern.test(candidate) ? candidate : ''
}

/**
 * Split an RFC 5322 address header without treating commas in quoted display
 * names as recipient separators. Gmail normally returns simple comma-separated
 * headers, but this also handles angle brackets and semicolon-terminated groups
 * conservatively.
 */
export function parseEmailHeader(value: unknown): ParsedEmailAddress[] {
  const text = String(value ?? '')
  const chunks: string[] = []
  let chunk = ''
  let quoted = false
  let escaped = false
  let angleDepth = 0
  for (const character of text) {
    if (escaped) {
      chunk += character
      escaped = false
      continue
    }
    if (character === '\\' && quoted) {
      chunk += character
      escaped = true
      continue
    }
    if (character === '"') {
      quoted = !quoted
      chunk += character
      continue
    }
    if (!quoted && character === '<') angleDepth += 1
    if (!quoted && character === '>' && angleDepth > 0) angleDepth -= 1
    if (!quoted && angleDepth === 0 && (character === ',' || character === ';')) {
      if (chunk.trim()) chunks.push(chunk.trim())
      chunk = ''
      continue
    }
    chunk += character
  }
  if (chunk.trim()) chunks.push(chunk.trim())

  return chunks.flatMap(raw => {
    const withoutComments = raw.replace(/\([^)]*\)/g, ' ').trim()
    const email = normalizeEmailAddress(withoutComments)
    if (!email) return []
    const bracketIndex = withoutComments.lastIndexOf('<')
    const name = bracketIndex >= 0
      ? withoutComments.slice(0, bracketIndex).replace(/^['"]|['"]$/g, '').trim()
      : ''
    return [{ email, name, raw }]
  })
}

export function normalizedEmailHeader(value: unknown) {
  return [...new Set(parseEmailHeader(value).map(item => item.email).filter(Boolean))].sort()
}

export function normalizedPersonName(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Return only header entries whose display name matches the requested person.
 * Matching is token-exact, never substring-based: “Ann” cannot silently match
 * “Joanne”, while a unique first-name match such as “Ann” → “Ann Smith” still
 * works when the provider supplies no competing Ann.
 */
export function matchingEmailHeaderEntries(value: unknown, query: unknown) {
  const normalizedQuery = normalizedPersonName(query)
  if (!normalizedQuery) return []
  const queryTokens = normalizedQuery.split(' ')
  return parseEmailHeader(value).filter(entry => {
    const name = normalizedPersonName(entry.name)
    if (!name) return false
    if (name === normalizedQuery) return true
    const nameTokens = new Set(name.split(' '))
    return queryTokens.every(token => nameTokens.has(token))
  })
}

export function canonicalEmailBody(value: unknown) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

export async function sha256Base64(value: string) {
  const bytes = decodeBase64(value)
  if (!bytes?.length) return ''
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function attachmentMetadataFromBase64(
  name: unknown,
  mimeType: unknown,
  base64: unknown,
): Promise<EmailAttachmentMetadata | null> {
  const safeName = String(name ?? '').trim().slice(0, 160)
  const safeMimeType = String(mimeType ?? '').trim().toLocaleLowerCase().slice(0, 160) || 'application/octet-stream'
  const value = String(base64 ?? '').replace(/\s+/g, '')
  const bytes = decodeBase64(value)
  if (!safeName || !bytes?.length) return null
  const sha256 = await sha256Base64(value)
  if (!sha256) return null
  return { name: safeName, mime_type: safeMimeType, size: bytes.length, sha256 }
}

export type GmailAttachmentPart = {
  filename?: string
  mimeType?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailAttachmentPart[]
}

export function attachmentParts(part: GmailAttachmentPart | undefined): GmailAttachmentPart[] {
  if (!part) return []
  const current = part.filename && (part.body?.data || part.body?.attachmentId)
    ? [part]
    : []
  return [...current, ...(part.parts ?? []).flatMap(attachmentParts)]
}

export function attachmentMetadataFromPart(
  part: GmailAttachmentPart,
  sha256: string,
): EmailAttachmentMetadata | null {
  const name = String(part.filename ?? '').trim()
  if (!name || !sha256) return null
  return {
    name,
    mime_type: String(part.mimeType ?? 'application/octet-stream').toLocaleLowerCase(),
    size: Number(part.body?.size ?? 0),
    sha256,
  }
}

export function attachmentsEqual(
  expected: EmailAttachmentMetadata[] = [],
  actual: EmailAttachmentMetadata[] = [],
) {
  const sort = (items: EmailAttachmentMetadata[]) => items
    .map(item => ({
      name: item.name.trim(),
      mime_type: item.mime_type.toLocaleLowerCase(),
      size: Number(item.size),
      sha256: item.sha256,
    }))
    .sort((left, right) => `${left.name}:${left.sha256}`.localeCompare(`${right.name}:${right.sha256}`))
  return JSON.stringify(sort(expected)) === JSON.stringify(sort(actual))
}

export function emailPayloadMatches(expected: EmailPayload, actual: EmailPayload) {
  const normalizedList = (items: string[]) => [...new Set(items.map(normalizeEmailAddress).filter(Boolean))].sort()
  return JSON.stringify(normalizedList(expected.to)) === JSON.stringify(normalizedList(actual.to)) &&
    JSON.stringify(normalizedList(expected.cc)) === JSON.stringify(normalizedList(actual.cc)) &&
    JSON.stringify(normalizedList(expected.bcc)) === JSON.stringify(normalizedList(actual.bcc)) &&
    expected.subject === actual.subject &&
    canonicalEmailBody(expected.body_text) === canonicalEmailBody(actual.body_text) &&
    attachmentsEqual(expected.attachments ?? [], actual.attachments ?? [])
}

export function retryAttemptAllowed(attempt: unknown, maximum = 3) {
  const value = Number(attempt)
  return Number.isFinite(value) && value < maximum
}

export function unsentPreparedDraftIds(actions: Array<Record<string, unknown>>) {
  const drafts = new Set<string>()
  const sent = new Set<string>()
  for (const action of actions) {
    if (action.status !== 'succeeded') continue
    const toolName = String(action.tool_name ?? '')
    const output = action.output && typeof action.output === 'object' ? action.output as Record<string, unknown> : {}
    const argumentsValue = action.arguments && typeof action.arguments === 'object' ? action.arguments as Record<string, unknown> : {}
    if (toolName === 'gmail.create_draft') {
      const draftId = String(output.draft_id ?? '')
      if (draftId) drafts.add(draftId)
    }
    if (toolName === 'gmail.send_message') {
      const draftId = String(argumentsValue.draft_id ?? '')
      if (draftId) sent.add(draftId)
    }
  }
  return [...drafts].filter(draftId => !sent.has(draftId))
}

/** Persist only attachment metadata; never store the attachment bytes in an agent action. */
export function persistedEmailArguments(
  toolName: string,
  argumentsValue: Record<string, unknown>,
  output: Record<string, unknown> = {},
) {
  if (toolName !== 'gmail.create_draft') return argumentsValue
  const {
    attachment_base64: _attachmentBase64,
    benchmark_attachment_base64: _benchmarkAttachmentBase64,
    ...safeArguments
  } = argumentsValue
  const attachmentName = String(output.attachment_name ?? safeArguments.attachment_name ?? '').slice(0, 160)
  const attachmentMimeType = String(output.attachment_mime_type ?? safeArguments.attachment_mime_type ?? '').slice(0, 160)
  const attachmentSize = Number(output.attachment_size ?? safeArguments.attachment_size ?? 0)
  const attachmentSha256 = String(output.attachment_sha256 ?? safeArguments.attachment_sha256 ?? '').slice(0, 128)
  return {
    ...safeArguments,
    ...(attachmentName && attachmentSha256 && attachmentSize > 0 ? {
      attachment_name: attachmentName,
      attachment_mime_type: attachmentMimeType || 'application/octet-stream',
      attachment_size: attachmentSize,
      attachment_sha256: attachmentSha256,
    } : {}),
  }
}
