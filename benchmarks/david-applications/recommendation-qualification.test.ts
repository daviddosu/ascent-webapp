import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runRecommendationQualification } from './recommendation-qualification'

describe('canonical recommendation coordination qualification', () => {
  it('passes the realistic multi-source, reply, support-pack, and CV flow', async () => {
    const output = mkdtempSync(join(tmpdir(), 'shotcount-recommendation-qualification-'))
    try {
      const report = await runRecommendationQualification(output)
      expect(report.passed, report.regressionCases.map(item => `${item.id}: ${item.detail}`).join('\n')).toBe(true)
      expect(report.metrics.autoResolvedFacts).toBeGreaterThan(0)
      expect(report.metrics.typedQuestions).toBe(1)
      expect(report.metrics.broadFreeTextQuestions).toBe(0)
      expect(Object.keys(report.progressDetailExamples)).toEqual([
        'approval',
        'choice',
        'email',
        'attachment',
        'relationship_confirmation',
        'rare_short_text',
        'weak_recommender_replacement',
      ])
      expect(report.finalStatus.state).toBe('complete')
      expect(report.cv.templateId).toBe('graduate_application_cv_v1')
      expect(report.cv.compiled).toBe(true)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 60_000)
})
