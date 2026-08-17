import { assertEquals } from 'jsr:@std/assert@1'
import { resolveTaskApplicationCaseLink } from './application-case-link.ts'

const campaignId = 'campaign-1'

Deno.test('keeps a valid task-owned application case link', () => {
  assertEquals(resolveTaskApplicationCaseLink({
    campaignId,
    currentCaseId: 'case-1',
    cases: [{ id: 'case-1', campaignId }],
  }), { kind: 'already_linked', caseId: 'case-1' })
})

Deno.test('relinks a resumed run to its one task-owned application case', () => {
  assertEquals(resolveTaskApplicationCaseLink({
    campaignId,
    currentCaseId: null,
    cases: [{ id: 'case-1', campaignId }],
  }), { kind: 'relinked', caseId: 'case-1' })
})

Deno.test('does not attach a case from another campaign', () => {
  assertEquals(resolveTaskApplicationCaseLink({
    campaignId,
    currentCaseId: null,
    cases: [{ id: 'case-other', campaignId: 'campaign-other' }],
  }), { kind: 'unlinked' })
})

Deno.test('fails closed when one task has multiple application cases', () => {
  assertEquals(resolveTaskApplicationCaseLink({
    campaignId,
    currentCaseId: null,
    cases: [{ id: 'case-1', campaignId }, { id: 'case-2', campaignId }],
  }), { kind: 'ambiguous', caseIds: ['case-1', 'case-2'] })
})
