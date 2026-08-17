import { describe, expect, it } from 'vitest'
import { renderRecommendationProgressDetail } from './data/recommendation-progress-detail'
import { createRecommendationInteraction, recommendationInteractionKinds } from '../supabase/functions/_shared/recommendation-workflow'

describe('recommendation Progress Detail', () => {
  it('renders every canonical interaction kind as a typed control', () => {
    for (const kind of recommendationInteractionKinds) {
      const interaction = createRecommendationInteraction({
        kind,
        id: `interaction-${kind}`,
        requirementId: 'requirement-1',
        question: `Question for ${kind}`,
        reason: 'This is the smallest decision still needed.',
        options: [{ value: 'candidate-1', label: 'Dr Ada Lee', description: 'Verified relationship context' }],
        field: 'recommender_email',
        approvalScope: 'recommendation_request',
        reusableContextKeys: ['recommender_email'],
      })
      const html = renderRecommendationProgressDetail(interaction, 'task-1')
      expect(html).toContain('Next step')
      expect(html).toContain(`interaction-${kind}`)
      expect(html).not.toContain('data-agent-context-input')
    }
  })

  it('shows known context and reason beside candidate choices', () => {
    const interaction = createRecommendationInteraction({
      kind: 'multiple_choice',
      id: 'portfolio-choice',
      requirementId: 'recommender_selection',
      question: 'Which recommender portfolio should I prepare?',
      reason: 'I ranked candidates by observed relationship evidence and programme fit.',
      knownContext: ['Dr Ada Lee: directly observed thesis work', 'Prof Sam Green: prior course relationship'],
      options: [{ value: 'lee', label: 'Dr Ada Lee', description: '92/100' }, { value: 'green', label: 'Prof Sam Green' }],
    })
    const html = renderRecommendationProgressDetail(interaction, 'task-1')
    expect(html).toContain('What I already resolved')
    expect(html).toContain('directly observed thesis work')
    expect(html).toContain('data-recommendation-choice')
    expect(html).toContain('submit-recommendation-multiple')
  })

  it('keeps internal workflow language out of the visible reason', () => {
    const interaction = createRecommendationInteraction({
      kind: 'confirmation',
      id: 'plain-language',
      requirementId: 'requirement-1',
      question: 'Confirm this choice',
      reason: 'The official requirement and candidate evidence are already resolved up to this bounded decision.',
      confirmLabel: 'Continue',
      cancelLabel: 'Not now',
    })
    const html = renderRecommendationProgressDetail(interaction, 'task-1')
    expect(html).toContain('I’ve checked the programme requirements and your material.')
    expect(html).not.toContain('bounded decision')
    expect(html).not.toContain('Progress Detail')
  })
})
