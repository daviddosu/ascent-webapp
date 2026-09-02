import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  createApplicationProgrammeSelectionInteraction,
  resolveApplicationProgrammeSelectionCommit,
  validateApplicationProgrammeSelection,
} from './application-programme-selection.ts'

const opportunities = [
  {
    id: 'programme-1',
    institution: 'Northbridge University',
    programmeTitle: 'DPhil Physics',
    officialUrl: 'https://northbridge.example/physics',
    fitScore: 92,
    deadlineAt: '2026-12-01T23:59:00Z',
  },
  {
    id: 'programme-2',
    institution: 'Southbank Institute',
    programmeTitle: 'PhD Astrophysics',
    officialUrl: 'https://southbank.example/astrophysics',
    fitScore: 81,
    deadlineAt: null,
  },
]

Deno.test('builds a single-choice interaction for the verified shortlist', () => {
  const interaction = createApplicationProgrammeSelectionInteraction('campaign-1', opportunities)
  assertEquals(interaction.id, 'application:programme-selection:campaign-1')
  assertEquals(interaction.kind, 'single_choice')
  assertEquals(interaction.options.map(option => option.value), ['programme-1', 'programme-2'])
  assert(interaction.options[0]?.description?.includes('Deadline 2026-12-01') === true)
})

Deno.test('accepts exactly one selected programme and rejects stale, empty, or multiple choices', () => {
  const interaction = createApplicationProgrammeSelectionInteraction('campaign-1', opportunities)
  assertEquals(validateApplicationProgrammeSelection(interaction, 'programme-1'), {
    accepted: true,
    selectedIds: ['programme-1'],
  })
  assertEquals(validateApplicationProgrammeSelection(interaction, []), {
    accepted: false,
    error: 'Choose one programme to continue.',
  })
  assertEquals(validateApplicationProgrammeSelection(interaction, ['programme-1', 'programme-2']), {
    accepted: false,
    error: 'Choose one programme to continue.',
  })
  assertEquals(validateApplicationProgrammeSelection(interaction, ['programme-missing']), {
    accepted: false,
    error: 'One of those programme choices is no longer current. Refresh the task and choose from the current shortlist.',
  })
})

Deno.test('binds one programme to the existing task and replays retries without switching cases', () => {
  assertEquals(resolveApplicationProgrammeSelectionCommit({
    selectedOpportunityId: 'programme-1',
    taskId: 'task-1',
  }), {
    kind: 'committed',
    opportunityId: 'programme-1',
    applicationCaseId: null,
  })

  const existing = [{ opportunityId: 'programme-1', caseId: 'case-1', taskId: 'task-1' }]
  assertEquals(resolveApplicationProgrammeSelectionCommit({
    selectedOpportunityId: 'programme-1',
    committedOpportunityId: 'programme-1',
    taskId: 'task-1',
    existingCases: existing,
  }), {
    kind: 'replayed',
    opportunityId: 'programme-1',
    applicationCaseId: 'case-1',
  })
  assert(resolveApplicationProgrammeSelectionCommit({
    selectedOpportunityId: 'programme-2',
    committedOpportunityId: 'programme-1',
    taskId: 'task-1',
    existingCases: existing,
  }).kind === 'conflict')
})
