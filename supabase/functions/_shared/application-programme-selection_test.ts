import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  createApplicationProgrammeSelectionInteraction,
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

Deno.test('builds a bounded multi-select interaction for the verified shortlist', () => {
  const interaction = createApplicationProgrammeSelectionInteraction('campaign-1', opportunities)
  assertEquals(interaction.id, 'application:programme-selection:campaign-1')
  assertEquals(interaction.kind, 'multiple_choice')
  assertEquals(interaction.options.map(option => option.value), ['programme-1', 'programme-2'])
  assertEquals(interaction.minSelections, 1)
  assertEquals(interaction.maxSelections, 2)
  assert(interaction.options[0]?.description?.includes('Deadline 2026-12-01') === true)
})

Deno.test('accepts every selected programme and rejects stale or empty choices', () => {
  const interaction = createApplicationProgrammeSelectionInteraction('campaign-1', opportunities)
  assertEquals(validateApplicationProgrammeSelection(interaction, ['programme-1', 'programme-2', 'programme-1']), {
    accepted: true,
    selectedIds: ['programme-1', 'programme-2'],
  })
  assertEquals(validateApplicationProgrammeSelection(interaction, []), {
    accepted: false,
    error: 'Select at least 1 programme.',
  })
  assertEquals(validateApplicationProgrammeSelection(interaction, ['programme-missing']), {
    accepted: false,
    error: 'One of those programme choices is no longer current. Refresh the task and choose from the current shortlist.',
  })
})
