/**
 * Provider-neutral application email intelligence.
 *
 * OpenAI writes an EmailActionPackage from verified context. These helpers own
 * objective validation only; Roon and Gmail remain the sole side-effect path.
 */

export const APPLICATION_EMAIL_SCHEMA_VERSION = 1 as const
export const APPLICATION_EMAIL_WORKFLOW_VERSION = 'application-email@1.0.0' as const
export const APPLICATION_EMAIL_DRAFT_RULE = [
  'For first-contact prospective-supervisor email, use a short subject tied to the verified programme or a specific research connection, never a generic label.',
  'Open with Dear Professor or Dr plus the recipient surname, then identify the applicant, programme, and reason for writing immediately.',
  'Use one verified reference to the recipient’s current work and one or two confirmed applicant-fit facts; do not use generic praise or unsupported claims.',
  'Make one small, specific, low-pressure ask, usually whether the faculty member expects to take students or would welcome a brief conversation.',
  'Keep the message roughly 120–180 words and below the typed 220-word maximum, with identical plain-text and HTML meaning, a professional sign-off, and only confirmed contact details.',
  'Attach exactly the current canonical CV PDF artifact. Do not substitute a raw upload or add extra files unless verified programme evidence requires them.',
  'If official programme policy discourages contact or the evidence is insufficient, do not draft or send the message.',
].join(' ')

export const applicationEmailTypes = [
  'prospective_supervisor_first_contact',
  'prospective_supervisor_follow_up',
  'supervisor_reply',
  'recommender_request',
  'recommender_follow_up',
  'admissions_question',
  'document_request',
  'fee_waiver_request',
  'funding_question',
  'application_follow_up',
  'interview_reply',
  'other_application_email',
] as const

export type ApplicationEmailType = typeof applicationEmailTypes[number]
export type EmailEvidenceFact = { fact: string; evidenceId: string }

export type ApplicationEmailContext = {
  taskId: string
  applicationCaseId: string
  emailType: ApplicationEmailType
  purpose: string
  recipient: {
    name: string
    role?: string
    institution?: string
    email: string
    emailVerification: 'official_verified' | 'provider_verified'
    sourceEvidenceIds: string[]
  }
  programme: { institution: string; programme: string; programmeId: string }
  contactPolicy?: {
    value: 'required' | 'recommended' | 'optional' | 'discouraged' | 'irrelevant'
    evidenceIds: string[]
  }
  applicantEvidence: EmailEvidenceFact[]
  programmeEvidence: EmailEvidenceFact[]
  recipientResearch?: {
    themes: string[]
    recentWork?: Array<{ title: string; url: string; relevance: string }>
    evidenceIds: string[]
  }
  threadContext?: { threadId: string; relevantMessages: string[]; evidenceIds?: string[] }
  attachments: Array<{ artifactId: string; type: string; filename: string; checksum: string }>
  communicationConstraints: { approvalRequired: boolean; maxWords?: number; attachmentRequired?: boolean }
}

export type EmailActionPackage = {
  schemaVersion: typeof APPLICATION_EMAIL_SCHEMA_VERSION
  workflowVersion: typeof APPLICATION_EMAIL_WORKFLOW_VERSION
  emailType: ApplicationEmailType
  recipientEmail: string
  subject: string
  textBody: string
  htmlBody: string
  communicationGoal: string
  strongestConnection?: string
  attachmentArtifactIds: string[]
  claims: Array<{ claim: string; evidenceIds: string[] }>
  followUp?: { recommended: boolean; afterDays?: number; purpose?: string }
  applicationImpact?: {
    material: boolean
    events: Array<{
      type: 'supervisor_available' | 'deadline_clarification' | 'additional_document_requested' | 'interview_offered'
      value: boolean | string
      evidenceIds: string[]
    }>
  }
  quality: {
    specific: boolean
    concise: boolean
    recipientSpecific: boolean
    programmeSpecific: boolean
    applicantEvidenceUsed: boolean
  }
}

export type EmailContextSufficiency = {
  sufficientForComposition: boolean
  sufficientForSend: boolean
  missing: string[]
  reusable: string[]
}

export type EmailActionValidation = {
  valid: boolean
  readyForSend: boolean
  issues: string[]
  sendBlockers: string[]
  repairReason: string | null
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: unknown, maximum = 30_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function canonicalEmail(value: unknown) {
  const email = clean(value, 320).toLocaleLowerCase()
  return emailPattern.test(email) ? email : ''
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function words(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

export function applicationEmailFirstContactIssues(subject: string, textBody: string) {
  const issues: string[] = []
  const normalizedSubject = clean(subject, 998)
  const normalizedBody = clean(textBody)
  if (!/^dear\s+(?:professor|prof\.?|dr\.?|doctor)\s+\S+/i.test(normalizedBody)) {
    issues.push('The first-contact email must address the faculty member by title and surname.')
  }
  if (/^(?:hello|hi|information|prospective student|question|request)$/i.test(normalizedSubject)) {
    issues.push('The first-contact subject must identify the programme or research connection, not use a generic label.')
  }
  if (!/(?:^|\n)(?:best|sincerely|kind regards|warm regards|regards),?\s*\n[^\n]{2,120}$/im.test(normalizedBody)) {
    issues.push('The first-contact email needs a professional sign-off.')
  }
  return issues
}

export function applicationEmailHtmlFromText(body: string) {
  return clean(body)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .split(/\n\n+/)
    .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function applicationEmailTextFromHtml(html: string) {
  return clean(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function checkApplicationEmailContext(context: ApplicationEmailContext): EmailContextSufficiency {
  const missing: string[] = []
  const reusable: string[] = []
  if (!clean(context.taskId, 160)) missing.push('task identity')
  else reusable.push('task identity')
  if (!clean(context.applicationCaseId, 160)) missing.push('application case')
  else reusable.push('application case')
  if (!applicationEmailTypes.includes(context.emailType)) missing.push('email type')
  if (!clean(context.purpose, 2_000)) missing.push('communication goal')
  if (!clean(context.recipient.name, 240)) missing.push('recipient identity')
  if (!canonicalEmail(context.recipient.email) || !context.recipient.sourceEvidenceIds.length) missing.push('verified recipient email')
  else reusable.push('verified recipient')
  if (!clean(context.programme.institution, 500) || !clean(context.programme.programme, 800) || !clean(context.programme.programmeId, 160)) missing.push('current programme context')
  else reusable.push('programme context')
  if (context.contactPolicy) reusable.push('contact policy')
  if (context.recipientResearch?.evidenceIds.length) reusable.push('recipient research')
  if (context.applicantEvidence.length) reusable.push('applicant evidence')
  if (context.threadContext?.threadId && context.threadContext.relevantMessages.length) reusable.push('thread context')
  const sendBlocker = context.communicationConstraints.attachmentRequired && !context.attachments.some(item => clean(item.artifactId, 160) && /^[a-f0-9]{64}$/i.test(item.checksum))
  if (sendBlocker) missing.push('required final attachment')
  const compositionMissing = missing.filter(item => item !== 'required final attachment')
  return {
    sufficientForComposition: compositionMissing.length === 0,
    sufficientForSend: missing.length === 0,
    missing: unique(missing),
    reusable: unique(reusable),
  }
}

function availableEvidenceIds(context: ApplicationEmailContext) {
  return new Set([
    ...context.recipient.sourceEvidenceIds,
    ...(context.contactPolicy?.evidenceIds ?? []),
    ...context.applicantEvidence.map(item => item.evidenceId),
    ...context.programmeEvidence.map(item => item.evidenceId),
    ...(context.recipientResearch?.evidenceIds ?? []),
    ...(context.threadContext?.evidenceIds ?? []),
  ].filter(Boolean))
}

/** Validate only facts and constraints that code can establish objectively. */
export function validateApplicationEmailAction(
  context: ApplicationEmailContext,
  action: EmailActionPackage,
): EmailActionValidation {
  const issues: string[] = []
  const sendBlockers: string[] = []
  const contextRecord = context as unknown as Record<string, unknown>
  const actionRecord = action as unknown as Record<string, unknown>
  const structurallyValid = Boolean(
    contextRecord.recipient && typeof contextRecord.recipient === 'object' &&
    contextRecord.programme && typeof contextRecord.programme === 'object' &&
    contextRecord.communicationConstraints && typeof contextRecord.communicationConstraints === 'object' &&
    Array.isArray(contextRecord.applicantEvidence) && Array.isArray(contextRecord.programmeEvidence) && Array.isArray(contextRecord.attachments) &&
    actionRecord.quality && typeof actionRecord.quality === 'object' &&
    Array.isArray(actionRecord.claims) && Array.isArray(actionRecord.attachmentArtifactIds),
  )
  if (!structurallyValid) {
    const malformed = 'The model response is not a complete typed EmailActionPackage and ApplicationEmailContext.'
    return { valid: false, readyForSend: false, issues: [malformed], sendBlockers: [], repairReason: `Revise the accepted draft once to fix only this objective failure: ${malformed}` }
  }
  const sufficiency = checkApplicationEmailContext(context)
  if (!sufficiency.sufficientForComposition) issues.push(...sufficiency.missing.filter(item => item !== 'required final attachment').map(item => `Missing ${item}.`))
  if (action.schemaVersion !== APPLICATION_EMAIL_SCHEMA_VERSION || action.workflowVersion !== APPLICATION_EMAIL_WORKFLOW_VERSION) issues.push('The email package version is unsupported.')
  if (action.emailType !== context.emailType) issues.push('The email type does not match the application action.')
  if (canonicalEmail(action.recipientEmail) !== canonicalEmail(context.recipient.email)) issues.push('The recipient does not match the verified application contact.')
  if (!clean(action.subject, 998)) issues.push('The email subject is missing.')
  if (!clean(action.textBody)) issues.push('The plain-text email body is missing.')
  if (!clean(action.htmlBody)) issues.push('The HTML email body is missing.')
  if (applicationEmailTextFromHtml(action.htmlBody) !== clean(action.textBody)) issues.push('The HTML and plain-text bodies do not have the same meaning.')
  if (/<(?:script|style|iframe|object|img|table)\b/i.test(action.htmlBody)) issues.push('The HTML body contains unsupported Gmail markup.')
  const maximumWords = context.communicationConstraints.maxWords ?? (context.emailType === 'prospective_supervisor_first_contact' ? 220 : 500)
  if (words(action.textBody) > maximumWords) issues.push(`The email exceeds the ${maximumWords}-word limit.`)
  if (!clean(action.communicationGoal, 2_000)) issues.push('The communication goal is missing.')
  if (!Object.values(action.quality).every(Boolean)) issues.push('The model quality rubric did not pass.')
  if (action.emailType === 'prospective_supervisor_first_contact') {
    issues.push(...applicationEmailFirstContactIssues(action.subject, action.textBody))
    const cvAttachments = context.attachments.filter(item => clean(item.type, 40).toLocaleLowerCase() === 'cv')
    const currentCv = cvAttachments.length === 1 && /^[a-f0-9]{64}$/i.test(cvAttachments[0]?.checksum ?? '')
      ? cvAttachments[0]
      : null
    if (!currentCv) {
      sendBlockers.push('A first-contact email requires exactly one current canonical CV PDF attachment.')
    } else if (action.attachmentArtifactIds.length !== 1 || action.attachmentArtifactIds[0] !== currentCv.artifactId) {
      sendBlockers.push('A first-contact email must attach exactly the current canonical CV artifact.')
    }
  }
  const evidenceIds = availableEvidenceIds(context)
  if (!action.claims.length) issues.push('The email package has no claim provenance.')
  for (const claim of action.claims) {
    if (!clean(claim.claim, 2_000)) issues.push('An email claim is empty.')
    if (!claim.evidenceIds.length) issues.push(`The claim "${clean(claim.claim, 180)}" has no evidence.`)
    const unsupported = claim.evidenceIds.filter(id => !evidenceIds.has(id))
    if (unsupported.length) issues.push(`The claim "${clean(claim.claim, 180)}" cites evidence not supplied to the model: ${unsupported.join(', ')}.`)
  }
  for (const event of action.applicationImpact?.events ?? []) {
    if (!['supervisor_available', 'deadline_clarification', 'additional_document_requested', 'interview_offered'].includes(event.type)) issues.push(`Application-impact event ${String(event.type)} is unsupported.`)
    if (!event.evidenceIds?.length || event.evidenceIds.some(id => !evidenceIds.has(id))) issues.push(`Application-impact event ${event.type} is not supported by the supplied Gmail evidence.`)
    if (typeof event.value !== 'boolean' && !clean(event.value, 2_000)) issues.push(`Application-impact event ${event.type} has no typed value.`)
  }
  const attachments = new Map(context.attachments.map(item => [item.artifactId, item]))
  for (const artifactId of action.attachmentArtifactIds) {
    const attachment = attachments.get(artifactId)
    if (!attachment) issues.push(`Attachment ${artifactId} does not belong to this application email context.`)
    else if (!/^[a-f0-9]{64}$/i.test(attachment.checksum)) sendBlockers.push(`Attachment ${artifactId} does not have a current checksum.`)
  }
  if (context.communicationConstraints.attachmentRequired && !action.attachmentArtifactIds.length) sendBlockers.push('The required attachment is not ready.')
  if (context.contactPolicy && ['discouraged', 'irrelevant'].includes(context.contactPolicy.value)) issues.push('The verified contact policy does not permit this email action.')
  if (context.threadContext && !context.threadContext.threadId) issues.push('A reply email is missing its verified provider thread ID.')
  if (!sufficiency.sufficientForSend) sendBlockers.push(...sufficiency.missing.filter(item => item === 'required final attachment').map(item => `Missing ${item}.`))
  const normalizedIssues = unique(issues)
  const normalizedBlockers = unique(sendBlockers)
  return {
    valid: normalizedIssues.length === 0,
    readyForSend: normalizedIssues.length === 0 && normalizedBlockers.length === 0,
    issues: normalizedIssues,
    sendBlockers: normalizedBlockers,
    repairReason: normalizedIssues.length ? `Revise the accepted draft once to fix only these objective failures: ${normalizedIssues.join(' ')}` : null,
  }
}

export function applicationEmailPayload(
  context: ApplicationEmailContext,
  action: EmailActionPackage,
): Record<string, unknown> {
  const validation = validateApplicationEmailAction(context, action)
  if (!validation.valid) throw new Error(validation.repairReason ?? 'The application email package is invalid.')
  return {
    application_email_context: context,
    email_action_package: action,
    to: [canonicalEmail(action.recipientEmail)],
    subject: action.subject,
    body_text: action.textBody,
    body_html: action.htmlBody,
    attachment_artifact_ids: action.attachmentArtifactIds,
    ...(context.threadContext ? { thread_id: context.threadContext.threadId } : {}),
  }
}

export function boundedApplicationEmailRepair(validation: EmailActionValidation, priorAttempts: number) {
  const attempts = Math.max(0, Math.min(1, Number.isFinite(priorAttempts) ? Math.floor(priorAttempts) : 0))
  return {
    allowed: !validation.valid && attempts === 0,
    attemptsUsed: attempts,
    attemptsRemaining: !validation.valid && attempts === 0 ? 1 : 0,
    reason: validation.repairReason,
  }
}

export function applicationEmailFollowUpAt(action: EmailActionPackage, sentAt: string) {
  if (!action.followUp?.recommended) return null
  const days = Number(action.followUp.afterDays)
  const sent = Date.parse(sentAt)
  if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isFinite(sent)) return null
  return new Date(sent + days * 86_400_000).toISOString()
}

export function supportedApplicationEmailImpactEvents(context: ApplicationEmailContext, action: EmailActionPackage) {
  const supplied = new Set(context.threadContext?.evidenceIds ?? [])
  return (action.applicationImpact?.events ?? []).filter(event =>
    ['supervisor_available', 'deadline_clarification', 'additional_document_requested', 'interview_offered'].includes(event.type) &&
    event.evidenceIds.length > 0 && event.evidenceIds.every(id => supplied.has(id)) &&
    (typeof event.value === 'boolean' || clean(event.value, 2_000)),
  )
}

export function readApplicationEmailPackage(payload: Record<string, unknown>) {
  const context = payload.application_email_context ?? payload.applicationEmailContext
  const action = payload.email_action_package ?? payload.emailActionPackage
  if (!context || typeof context !== 'object' || Array.isArray(context) || !action || typeof action !== 'object' || Array.isArray(action)) return null
  return { context: context as ApplicationEmailContext, action: action as EmailActionPackage }
}
