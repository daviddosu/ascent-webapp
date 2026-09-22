import { describe, expect, it } from 'vitest'
import { canMarkApplicationReady, classifyApplicationContext, classifyGraduateApplicationTask, groundedClaims, hasGraduateScholarshipEvidence, isApplicationIntent, isGraduateApplicationTask, preferOfficialSource } from './data/application'

describe('application vertical safeguards', () => {
  it('routes every nonempty objective into graduate application intake', () => {
    expect(isGraduateApplicationTask('apply to harvard physics')).toBe(true)
    expect(isGraduateApplicationTask('   ', '')).toBe(false)
    expect(isApplicationIntent('Apply to this university programme')).toBe(true)
    expect(isApplicationIntent('Apply for the accelerator', 'Use the attached screenshot')).toBe(true)
    expect(isApplicationIntent('Research accelerator programmes')).toBe(true)
    expect(isApplicationIntent('Prepare my Stanford Physics PhD application')).toBe(true)
  })

  it('defaults underspecified requests to graduate application intake', () => {
    expect(isGraduateApplicationTask('Prepare my Stanford Physics PhD application')).toBe(true)
    expect(isGraduateApplicationTask('Email my professor about my PhD application')).toBe(true)
    expect(isGraduateApplicationTask('Ask referee for a recommendation letter', 'For my Stanford Physics PhD application')).toBe(true)
    expect(isGraduateApplicationTask('Upload official transcript to the application portal', 'For my Stanford Physics PhD application')).toBe(true)
    expect(isGraduateApplicationTask('Tailor my CV for Stanford Physics PhD')).toBe(true)
    expect(isGraduateApplicationTask('Research five relevant professors', 'For my Stanford Physics PhD application')).toBe(true)
    expect(isGraduateApplicationTask('Apply to this university programme')).toBe(true)
    expect(isGraduateApplicationTask('Ask referee for a recommendation letter')).toBe(true)
    expect(isGraduateApplicationTask('Follow up with everyone I emailed last week')).toBe(true)
    expect(isGraduateApplicationTask('Apply for an internship')).toBe(true)
    expect(isGraduateApplicationTask('Research five relevant professors')).toBe(true)
    expect(isGraduateApplicationTask('Prepare a personal statement')).toBe(true)
    expect(isGraduateApplicationTask('Prepare a research proposal')).toBe(true)
    expect(isGraduateApplicationTask('Get a job recommendation letter')).toBe(true)
    expect(isGraduateApplicationTask('Prepare a grant proposal')).toBe(true)
  })

  it('routes named graduate scholarships through the application guardrail', () => {
    expect(classifyGraduateApplicationTask('Apply for Chevening')).toEqual({ inScope: true, targetKind: 'scholarship' })
    expect(classifyGraduateApplicationTask('Apply for the Chevening Scholarship')).toEqual({ inScope: true, targetKind: 'scholarship' })
    expect(classifyGraduateApplicationTask('Apply for a graduate scholarship')).toEqual({ inScope: true, targetKind: 'scholarship' })
    expect(classifyGraduateApplicationTask('Apply for a scholarship')).toEqual({ inScope: true, targetKind: 'programme' })
    expect(hasGraduateScholarshipEvidence('Chevening Scholarship')).toBe(true)
    expect(hasGraduateScholarshipEvidence('Rhodes Scholarship', 'Applicants must enrol on a full-time postgraduate course.')).toBe(true)
    expect(hasGraduateScholarshipEvidence('Summer Scholarship', 'The award supports a summer research placement.')).toBe(false)
  })

  it('gives official sources precedence over screenshot claims', () => {
    const screenshot = { url: 'shotcount://attachment/1', value: 'Deadline 1 August' }
    const result = preferOfficialSource(screenshot, [
      { url: 'https://social.example/post', value: 'Deadline 1 August' },
      { url: 'https://apply.university.example/programme', value: 'Deadline 25 July' },
    ], ['university.example'])
    expect(result?.value).toBe('Deadline 25 July')
  })

  it('uses reusable context and asks only for unavailable facts', () => {
    const result = classifyApplicationContext([
      { name: 'CV', required: true },
      { name: 'Transcript', required: true },
      { name: 'Motivation statement', required: true, limit: 500, limitKind: 'words' },
    ], [{ originalFilename: 'David_CV.pdf', mimeType: 'application/pdf', reusable: true }])
    expect(result.map(item => item.classification)).toEqual(['available', 'needs_user', 'can_prepare'])
  })

  it('rejects unsupported facts and unevidenced readiness', () => {
    expect(groundedClaims(['BSc Computer Science', 'First-class degree'], ['BSc Computer Science'])).toEqual(['BSc Computer Science'])
    expect(canMarkApplicationReady([{ name: 'CV', required: true, satisfied: true }], false)).toBe(false)
    expect(canMarkApplicationReady([{ name: 'CV', required: true, satisfied: true, evidence: 'DOM shows uploaded' }], false)).toBe(true)
    expect(canMarkApplicationReady([{ name: 'CV', required: true, satisfied: true, evidence: 'DOM shows uploaded' }], true)).toBe(false)
  })
})
