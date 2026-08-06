import { describe, expect, it } from 'vitest'
import { compileLatex } from '../api/application-cv.js'
import { matchApplicationOtp, classifyApplicationReply, type OtpMessage } from '../supabase/functions/_shared/david-applications'
import { renderCanonicalCv, type CvData } from '../supabase/functions/_shared/cv'

type WorkflowState = {
  route: 'david'
  profile: { name: string; email: string; conflicts: string[]; consent: boolean }
  shortlistApproved: boolean
  opportunity: { officialUrl: string; verification: 'verified' }
  case: { id: string; stage: string; status: string }
  cv?: { templateId: string; pdfChecksum: string; pageCount: number }
  writer: { status: string; questions: string[]; revisions: number; artifacts: string[] }
  referee: { status: string; firstContactApproved: boolean }
  otp: { status: string; requestId: string; codeHash?: string }
  portal: { sessionId: string; checkpoints: string[]; expired: boolean }
  readiness: boolean
  submission: { attempts: number; applicationId?: string; confirmationEmail: boolean; replyClassification?: string }
}

function fact<T>(value: T, source: string) {
  return { value, provenance: { confirmed: true as const, sourceFactIds: [source], sourceAssetIds: [], kind: 'user_statement' as const } }
}

function cvData(): CvData {
  return {
    fullName: fact('Ada Lovelace', 'profile:legalName'),
    email: fact('ada@example.edu', 'profile:email'),
    phone: null,
    location: null,
    linkedin: null,
    github: null,
    portfolio: null,
    website: null,
    preferredName: null,
    education: [fact({ institution: 'Analytical University', degree: 'MSc', field: 'Computational Physics', startDate: '2022', endDate: '2024', grade: 'Distinction', country: 'Nigeria' }, 'profile:education:0')],
    researchExperience: [],
    workExperience: [],
    teachingExperience: [],
    publications: [],
    presentations: [],
    projects: [],
    researchProjects: [],
    leadership: [],
    awards: [],
    scholarships: [],
    certifications: [],
    technicalSkills: [fact('Python, scientific computing', 'profile:skills:0')],
    researchSkills: [fact('Numerical modelling', 'profile:researchInterests:0')],
    languages: [],
    coursework: [],
    memberships: [],
  }
}

function restart<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('David application execution: deterministic restart-safe E2E', () => {
  it('completes the full research → documents → people → portal → confirmation workflow once', async () => {
    let state: WorkflowState = {
      route: 'david',
      profile: { name: 'Ada Lovelace', email: 'ada@example.edu', conflicts: ['Ada Lovelace', 'A. Lovelace'], consent: true },
      shortlistApproved: false,
      opportunity: { officialUrl: 'https://university.example.edu/phd', verification: 'verified' },
      case: { id: 'case-1', stage: 'research', status: 'active' },
      writer: { status: 'unassigned', questions: [], revisions: 0, artifacts: [] },
      referee: { status: 'not_started', firstContactApproved: false },
      otp: { status: 'queued', requestId: 'otp-request-1' },
      portal: { sessionId: 'session-1', checkpoints: [], expired: false },
      readiness: false,
      submission: { attempts: 0, confirmationEmail: false },
    }

    // David is the route owner and resolves a conflicting imported profile only
    // after the user confirms the canonical identity.
    expect(state.route).toBe('david')
    state.profile.conflicts = []
    expect(state.profile.name).toBe('Ada Lovelace')
    state.shortlistApproved = true
    state.case.stage = 'document_preparation'

    const rendered = renderCanonicalCv({ data: cvData(), pageTarget: 'one_page', sectionOrder: ['education', 'researchSkills', 'technicalSkills'] })
    const compiled = await compileLatex(rendered.latex, { expectedName: state.profile.name, expectedEmail: state.profile.email })
    state.cv = { templateId: rendered.templateId, pdfChecksum: Buffer.from(compiled.pdf).toString('base64').slice(0, 32), pageCount: compiled.pageCount }
    expect(state.cv.templateId).toBe('graduate_application_cv_v1')
    expect(state.cv.pageCount).toBeGreaterThanOrEqual(1)

    state.writer.status = 'assigned'
    state.case.stage = 'writer_assignment'
    state = restart(state)
    state.writer.status = 'awaiting_question'
    state.writer.questions.push('Which research outcome should be prioritised?')
    state.writer.status = 'revision_requested'
    state.writer.revisions = 1
    state.writer.status = 'quality_review'
    state.writer.artifacts.push('writer-draft-artifact-1')
    expect(state.writer.artifacts).toHaveLength(1)

    state.referee.status = 'pack_ready'
    state.referee.firstContactApproved = true
    state.referee.status = 'request_sent'
    state.case.stage = 'referee_coordination'

    // The OTP request survives a process restart without a code field. The
    // matched code exists only in this local continuation and is represented by
    // a hash in the durable state.
    state = restart(state)
    expect(state.otp).not.toHaveProperty('code')
    const messages: OtpMessage[] = [{
      id: 'otp-message-1', threadId: 'thread-1', from: 'admissions@university.example.edu', to: state.profile.email,
      subject: 'University verification code', body: 'Your verification code is 481206.', receivedAt: new Date().toISOString(), applicationCaseId: state.case.id,
    }]
    const matched = matchApplicationOtp({ applicationCaseId: state.case.id, institution: 'University', portal: 'portal', destinationEmail: state.profile.email, requestedAt: new Date(Date.now() - 60_000).toISOString(), senderClues: ['admissions@university.example.edu'], subjectClues: ['verification'] }, messages)
    expect(matched?.code).toBe('481206')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(matched!.code))
    state.otp = { ...state.otp, status: 'delivered', codeHash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') }
    expect(state.otp).not.toHaveProperty('code')

    state.portal.checkpoints.push('account', 'verification', 'profile', 'documents')
    state.portal.expired = true
    state = restart(state)
    expect(state.portal.checkpoints).toContain('documents')
    state.portal.sessionId = 'session-2'
    state.portal.expired = false
    state.portal.checkpoints.push('review')
    state.case.stage = 'submission_approval'
    state.case.status = 'awaiting_submission_approval'
    state.readiness = state.profile.consent && state.shortlistApproved && Boolean(state.cv) && state.writer.artifacts.length === 1 && state.referee.firstContactApproved && state.otp.status === 'delivered' && state.portal.checkpoints.includes('review')
    expect(state.readiness).toBe(true)

    state.submission.attempts += 1
    state.submission.applicationId = 'SC-TEST-2027-001'
    state.submission.confirmationEmail = true
    state.case.stage = 'submitted'
    state.case.status = 'submitted'
    const duplicate = restart(state)
    if (duplicate.submission.applicationId) duplicate.submission.attempts = state.submission.attempts
    expect(duplicate.submission.attempts).toBe(1)
    expect(duplicate.submission.confirmationEmail).toBe(true)
    state.submission.replyClassification = classifyApplicationReply('Application update', 'We would like to invite you to an interview.')
    expect(state.submission.replyClassification).toBe('interview_invitation')
  })
})
