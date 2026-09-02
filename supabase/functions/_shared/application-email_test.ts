import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  APPLICATION_EMAIL_SCHEMA_VERSION,
  APPLICATION_EMAIL_WORKFLOW_VERSION,
  applicationEmailHtmlFromText,
  applicationEmailPayload,
  applicationEmailFollowUpAt,
  boundedApplicationEmailRepair,
  checkApplicationEmailContext,
  supportedApplicationEmailImpactEvents,
  validateApplicationEmailAction,
  type ApplicationEmailContext,
  type EmailActionPackage,
} from './application-email.ts'

function context(overrides: Partial<ApplicationEmailContext> = {}): ApplicationEmailContext {
  return {
    taskId: 'task-1',
    applicationCaseId: 'case-1',
    emailType: 'admissions_question',
    purpose: 'Clarify whether the writing sample may be co-authored.',
    recipient: { name: 'Graduate Admissions', role: 'admissions', institution: 'Example University', email: 'grad@example.edu', emailVerification: 'official_verified', sourceEvidenceIds: ['official-contact'] },
    programme: { institution: 'Example University', programme: 'Physics PhD', programmeId: 'programme-1' },
    contactPolicy: { value: 'recommended', evidenceIds: ['policy-1'] },
    applicantEvidence: [{ fact: 'The applicant has a co-authored manuscript.', evidenceId: 'applicant-1' }],
    programmeEvidence: [{ fact: 'The programme requires a writing sample.', evidenceId: 'programme-1' }],
    attachments: [],
    communicationConstraints: { approvalRequired: true, maxWords: 180 },
    ...overrides,
  }
}

function action(overrides: Partial<EmailActionPackage> = {}): EmailActionPackage {
  const textBody = 'Dear Graduate Admissions,\n\nCould you confirm whether a co-authored manuscript is acceptable for the Physics PhD writing-sample requirement?\n\nKind regards,\nAmara Okafor'
  return {
    schemaVersion: APPLICATION_EMAIL_SCHEMA_VERSION,
    workflowVersion: APPLICATION_EMAIL_WORKFLOW_VERSION,
    emailType: 'admissions_question',
    recipientEmail: 'grad@example.edu',
    subject: 'Physics PhD writing-sample question',
    textBody,
    htmlBody: applicationEmailHtmlFromText(textBody),
    communicationGoal: 'Resolve the writing-sample requirement.',
    attachmentArtifactIds: [],
    claims: [
      { claim: 'The programme requires a writing sample.', evidenceIds: ['programme-1'] },
      { claim: 'The applicant plans to use a co-authored manuscript.', evidenceIds: ['applicant-1'] },
    ],
    quality: { specific: true, concise: true, recipientSpecific: true, programmeSpecific: true, applicantEvidenceUsed: true },
    ...overrides,
  }
}

Deno.test('reuses sufficient application email context without requesting research', () => {
  const result = checkApplicationEmailContext(context())
  assertEquals(result.sufficientForComposition, true)
  assertEquals(result.missing, [])
  assert(result.reusable.includes('verified recipient'))
  assert(result.reusable.includes('programme context'))
})

Deno.test('accepts one complete model-written package and produces exact Roon fields', () => {
  const input = context()
  const packageValue = action()
  const validation = validateApplicationEmailAction(input, packageValue)
  assertEquals(validation.valid, true)
  assertEquals(validation.readyForSend, true)
  const payload = applicationEmailPayload(input, packageValue)
  assertEquals(payload.subject, packageValue.subject)
  assertEquals(payload.body_text, packageValue.textBody)
  assertEquals(payload.email_action_package, packageValue)
})

Deno.test('returns one precise repair reason for unsupported evidence', () => {
  const validation = validateApplicationEmailAction(context(), action({ claims: [{ claim: 'The department guarantees funding.', evidenceIds: ['unsupported-funding'] }] }))
  assertEquals(validation.valid, false)
  assertStringIncludes(validation.repairReason ?? '', 'unsupported-funding')
  assertEquals(boundedApplicationEmailRepair(validation, 0).allowed, true)
  assertEquals(boundedApplicationEmailRepair(validation, 1).allowed, false)
})

Deno.test('blocks discouraged contact before Roon', () => {
  const validation = validateApplicationEmailAction(context({ contactPolicy: { value: 'discouraged', evidenceIds: ['policy-1'] } }), action())
  assertEquals(validation.valid, false)
  assert(validation.issues.some(issue => issue.includes('does not permit')))
})

Deno.test('allows composition while a required exact attachment is pending', () => {
  const input = context({
    emailType: 'recommender_request',
    attachments: [],
    communicationConstraints: { approvalRequired: true, attachmentRequired: true },
  })
  const packageValue = action({ emailType: 'recommender_request' })
  const sufficiency = checkApplicationEmailContext(input)
  const validation = validateApplicationEmailAction(input, packageValue)
  assertEquals(sufficiency.sufficientForComposition, true)
  assertEquals(sufficiency.sufficientForSend, false)
  assertEquals(validation.valid, true)
  assertEquals(validation.readyForSend, false)
})

Deno.test('validates the exact attachment artifact and checksum', () => {
  const input = context({
    attachments: [{ artifactId: 'cv-1', type: 'cv', filename: 'CV.pdf', checksum: 'a'.repeat(64) }],
    communicationConstraints: { approvalRequired: true, attachmentRequired: true },
  })
  const validation = validateApplicationEmailAction(input, action({ attachmentArtifactIds: ['cv-1'] }))
  assertEquals(validation.readyForSend, true)
  const drifted = validateApplicationEmailAction(input, action({ attachmentArtifactIds: ['cv-2'] }))
  assertEquals(drifted.valid, false)
})

Deno.test('uses one compact reply package for interpretation and response', () => {
  const input = context({ emailType: 'supervisor_reply', threadContext: { threadId: 'thread-1', relevantMessages: ['Professor: I may have capacity next year.'], evidenceIds: ['gmail-message-1'] } })
  const packageValue = action({
    emailType: 'supervisor_reply',
    applicationImpact: { material: true, events: [{ type: 'supervisor_available', value: true, evidenceIds: ['gmail-message-1'] }] },
  })
  const validation = validateApplicationEmailAction(input, packageValue)
  assertEquals(validation.valid, true)
  assert(checkApplicationEmailContext(input).reusable.includes('thread context'))
  assertEquals(supportedApplicationEmailImpactEvents(input, packageValue), packageValue.applicationImpact?.events)
})

Deno.test('turns model follow-up guidance into a deterministic due date', () => {
  const packageValue = action({ followUp: { recommended: true, afterDays: 7, purpose: 'Check for a reply.' } })
  assertEquals(applicationEmailFollowUpAt(packageValue, '2026-08-24T12:00:00.000Z'), '2026-08-31T12:00:00.000Z')
  assertEquals(applicationEmailFollowUpAt(action(), '2026-08-24T12:00:00.000Z'), null)
})
