export type EmailSafetyCheck = {
  warnings: string[]
  requiresAttachment: boolean
  possibleSensitiveContent: boolean
  hasPlaceholder: boolean
}

export function assessEmailDraft(subject: string, body: string): EmailSafetyCheck {
  const text = `${subject}\n${body}`
  const warnings: string[] = []
  const attachmentReference = /\b(?:attached|attachment|enclosed|see\s+(?:the\s+)?(?:deck|document|file|report|proposal)\s+attached)\b/i
  const requiresAttachment = [...text.matchAll(new RegExp(attachmentReference.source, 'gi'))].some(match => {
    const index = Number(match.index ?? 0)
    const before = text.slice(Math.max(0, index - 48), index)
    return !/(?:\bno|\bwithout|\bnot|\bdon't|\bdo\s+not|\bdoesn't|\bdoes\s+not|\bwon't|\bwill\s+not)\s+(?:an?\s+)?$/i.test(before)
  })
  const hasPlaceholder = /(?:\{\{[^}]+\}\}|\[[A-Z][^\]]{1,40}\]|\b(?:tbd|todo|insert\s+.+|your\s+name)\b)/i.test(text)
  const possibleSensitiveContent = /\b(?:password|passcode|one[-\s]?time\s+code|otp|private\s+key|api[-\s]?key|bank\s+account|card\s+number|social\s+security)\b/i.test(text)
  if (requiresAttachment) warnings.push('This message refers to an attachment.')
  if (hasPlaceholder) warnings.push('This message appears to contain an unfinished placeholder.')
  if (possibleSensitiveContent) warnings.push('This message may contain sensitive information.')
  if (/^\s*(?:re:\s*)?(?:follow\s*up|hello|hi)\s*$/i.test(subject)) warnings.push('Use a more specific subject before sending.')
  return { warnings, requiresAttachment, possibleSensitiveContent, hasPlaceholder }
}
