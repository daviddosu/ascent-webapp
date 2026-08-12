import { describe, expect, it } from 'vitest'
import {
  buildSupplementalAnswerStrategy,
  countSupplementalResponse,
  discoverApplicationQuestions,
  runSupplementalAnswerGates,
  resolveSupplementalAnswer,
  validateSupplementalAnswer,
  verifySavedSupplementalAnswer,
  type ApplicationQuestion,
} from './application-questions'

function question(overrides: Partial<ApplicationQuestion> = {}): ApplicationQuestion {
  return {
    id: 'application-question:test',
    applicationCaseId: 'case-1',
    questionKey: 'portal:research:interests',
    portal: 'benchmark.test',
    portalSection: 'Research direction',
    exactPrompt: 'Briefly describe your research interests. Limit your response to 150 words.',
    normalizedPrompt: 'briefly describe your research interests. limit your response to 150 words.',
    questionType: 'research_interest',
    inputType: 'textarea',
    required: true,
    optional: false,
    minimum: null,
    maximum: 150,
    unit: 'words',
    validationRule: 'required',
    options: [],
    conditionalTrigger: null,
    source: { kind: 'portal_dom', portal: 'benchmark.test', url: 'https://benchmark.test/apply', section: 'Research direction', observedAt: null, evidenceIds: ['portal-observation-1'] },
    currentValue: null,
    status: 'ready_to_answer',
    answerStrategy: null,
    evidenceDependencies: [],
    artifactDependencies: [],
    writerDependencies: [],
    approvalRequirement: 'none',
    savedStateEvidence: null,
    answerRoute: null,
    answerValue: null,
    lastError: null,
    ...overrides,
  }
}

describe('canonical supplemental application questions', () => {
  it('discovers the exact prompt, semantic type, options, and word constraint', () => {
    const [found] = discoverApplicationQuestions({
      applicationCaseId: 'case-1',
      portal: 'benchmark.test',
      section: 'Research direction',
      url: 'https://benchmark.test/apply?step=research',
      fields: [{
        name: 'research_interests',
        label: 'Research interests',
        prompt: 'Briefly describe your research interests and how they connect to this programme. Limit your response to 150 words.',
        type: 'textarea',
        value: '',
        checked: false,
        required: true,
        maxLength: null,
        minLength: null,
        options: [],
        section: 'Research direction',
      }],
    })
    expect(found).toBeDefined()
    expect(found?.exactPrompt).toBe('Briefly describe your research interests and how they connect to this programme. Limit your response to 150 words.')
    expect(found?.questionType).toBe('research_interest')
    expect(found?.maximum).toBe(150)
    expect(found?.unit).toBe('words')
    expect(found?.required).toBe(true)
  })

  it('groups radio/select controls into one question and preserves every option', () => {
    const found = discoverApplicationQuestions({
      applicationCaseId: 'case-1',
      portal: 'benchmark.test',
      section: 'Declarations',
      fields: [
        { name: 'disciplinary_history', label: 'Conduct history', prompt: 'Have you ever been subject to formal disciplinary action?', type: 'radio', value: 'yes', checked: false, required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
        { name: 'disciplinary_history', label: 'Conduct history', prompt: 'Have you ever been subject to formal disciplinary action?', type: 'radio', value: 'no', checked: false, required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
      ],
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.questionType).toBe('yes_no')
    expect(found[0]?.options.map(option => option.value)).toEqual(['yes', 'no'])
  })

  it('resolves facts before asking the user and routes substantial writing to the writer system', () => {
    const factual = question({ questionType: 'factual', inputType: 'text', exactPrompt: 'What is your undergraduate institution?', normalizedPrompt: 'what is your undergraduate institution?', questionKey: 'education:institution', maximum: null, unit: null })
    const resolved = resolveSupplementalAnswer(factual, { facts: [{ factId: 'profile:education[0].institution', value: 'University of Lagos', evidenceIds: ['cv-1'], verified: true }] })
    expect(resolved.answer).toBe('University of Lagos')
    expect(resolved.route).toBe('deterministic')
    expect(resolved.progressInteraction).toBeNull()

    const narrative = question({ questionType: 'leadership', exactPrompt: 'Describe a leadership experience and its impact.', normalizedPrompt: 'describe a leadership experience and its impact.', maximum: 500, unit: 'words' })
    const strategy = buildSupplementalAnswerStrategy(narrative, 'writer_delegate', ['profile:leadership[0]'], ['cv-2'])
    const delegated = resolveSupplementalAnswer({ ...narrative, answerStrategy: strategy, answerRoute: 'writer_delegate' }, { facts: [{ factId: 'profile:leadership[0]', value: 'Led a student research team', evidenceIds: ['cv-2'], verified: true }] })
    expect(delegated.route).toBe('writer_delegate')
    expect(delegated.status).toBe('awaiting_writer')
    expect(delegated.strategy.writerBrief).toContain('exact prompt')
  })

  it('enforces the portal unit exactly and blocks unsupported narrative answers', () => {
    const limited = question()
    expect(countSupplementalResponse('one two three').words).toBe(3)
    expect(validateSupplementalAnswer(limited, 'one '.repeat(151)).issues).toContain('maximum_words')
    const gates = runSupplementalAnswerGates(limited, 'A grounded response from verified research experience.', { facts: [] })
    expect(gates.issues).toContain('no_verified_evidence_dependencies')
  })

  it('requires exact read-back and save evidence before verification', () => {
    const candidate = question({ questionType: 'factual', inputType: 'text', maximum: null, unit: null })
    const mismatch = verifySavedSupplementalAnswer({ question: candidate, persistedValue: 'University of Lagos', readBackValue: 'University of Ibadan', saveConfirmation: 'Section saved', sessionId: 'session-1', evidenceIds: ['checkpoint-1'] })
    expect(mismatch.verified).toBe(false)
    expect(mismatch.issues).toContain('read_back_mismatch')
    const saved = verifySavedSupplementalAnswer({ question: candidate, persistedValue: 'University of Lagos', readBackValue: 'University of Lagos', saveConfirmation: 'Section saved', sessionId: 'session-1', evidenceIds: ['checkpoint-1'] })
    expect(saved.verified).toBe(true)
    expect(saved.evidence.verified).toBe(true)
  })
})
