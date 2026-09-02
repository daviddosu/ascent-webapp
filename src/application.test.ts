import { describe, expect, it } from 'vitest'
import { canMarkApplicationReady, classifyApplicationContext, groundedClaims, isApplicationIntent, preferOfficialSource } from './data/application'

describe('application vertical safeguards', () => {
  it('detects graduate application objectives and rejects unrelated application work', () => {
    expect(isApplicationIntent('Apply to this university programme')).toBe(true)
    expect(isApplicationIntent('Apply for the accelerator', 'Use the attached screenshot')).toBe(false)
    expect(isApplicationIntent('Research accelerator programmes')).toBe(false)
    expect(isApplicationIntent('Prepare my Stanford Physics PhD application')).toBe(true)
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
