import { describe, expect, it } from 'vitest'
import { renderWorkSampleProgressDetail } from './data/work-sample-progress-detail'
import type { WorkSampleInteraction } from '../supabase/functions/_shared/work-sample-workflow'

const base = (kind: WorkSampleInteraction['kind']): WorkSampleInteraction => ({
  workflow: 'work_sample',
  id: `work-sample-${kind}`,
  requirementId: 'writing-sample:1',
  kind,
  question: `Work-sample question for ${kind}`,
  reason: 'The official requirement and candidate evidence are already resolved up to this bounded decision.',
  knownContext: ['Official source says one PDF, maximum six pages.', 'The thesis checksum and authorship evidence are preserved.'],
  options: [{ value: 'thesis', label: 'Thesis excerpt', description: 'Inspected programme fit: 91/100' }],
  reusableContextKeys: [],
  confirmLabel: 'Approve artifact',
  cancelLabel: 'Choose another',
  acceptedMimeTypes: ['application/pdf'],
  maximumFiles: 1,
  minSelections: 1,
})

describe('work-sample Progress Detail', () => {
  it('renders typed choice and approval controls without a broad context textarea', () => {
    for (const kind of ['single_choice', 'approval', 'attachment_request'] as const) {
      const html = renderWorkSampleProgressDetail(base(kind), 'task-1')
      expect(html).toContain('Next step')
      expect(html).toContain(`work-sample-${kind}`)
      expect(html).not.toContain('data-agent-context-input')
    }
  })

  it('shows exact source-backed context and candidate rationale', () => {
    const html = renderWorkSampleProgressDetail(base('single_choice'), 'task-1')
    expect(html).toContain('Official source says one PDF')
    expect(html).toContain('data-interaction-value="thesis"')
    expect(html).toContain('Inspected programme fit')
  })

  it('turns internal decision wording into a clear next step', () => {
    const html = renderWorkSampleProgressDetail(base('single_choice'), 'task-1')
    expect(html).toContain('I’ve checked the programme requirements and your material.')
    expect(html).not.toContain('bounded decision')
    expect(html).not.toContain('Progress Detail')
  })
})
