import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  APPLICATION_WORKFLOW_VERSION,
  bindApplicationWorkflowOpportunities,
  compileApplicationWorkflow,
  scheduleApplicationWorkflow,
  validateApplicationWorkflowSelection,
  workflowMinimumCandidateCount,
  workflowNeedsCandidateExpansion,
} from './application-workflow.ts'

const evidence = [
  { id: 'award-policy', url: 'https://award.example/apply', excerpt: 'Applicants must apply to three eligible UK courses.', authority: 'official' as const },
  { id: 'course-policy', url: 'https://award.example/courses', excerpt: 'Choose three eligible courses at different institutions.', authority: 'official' as const },
]

Deno.test('compiles a source-backed multi-target scholarship graph and schedules each case lane', () => {
  const spec = compileApplicationWorkflow({
    rootTarget: { key: 'award', label: 'Graduate award', targetKind: 'scholarship' },
    officialEvidence: evidence,
    candidateKeys: ['award', 'course-a', 'course-b', 'course-c'],
    raw: {
      mode: 'coupled_targets',
      root_target_key: 'award',
      targets: [
        { key: 'award', label: 'Graduate award', target_kind: 'scholarship', role: 'primary', required: true, source_evidence: [evidence[0]] },
      ],
      selection_groups: [
        { id: 'courses', label: 'Choose three eligible courses', target_kind: 'course', min_selections: 3, max_selections: 3, required: true, target_keys: ['course-a', 'course-b', 'course-c'], source_evidence: [evidence[0], evidence[1]] },
      ],
      edges: [
        { from: 'award', to: 'course-a', relation: 'supports', source_evidence: [evidence[0]] },
      ],
    },
  })
  assertEquals(spec.version, APPLICATION_WORKFLOW_VERSION)
  assertEquals(spec.status, 'verified')
  assertEquals(spec.mode, 'coupled_targets')
  assertEquals(spec.selectionGroups[0]?.minSelections, 3)
  assertEquals(spec.selectionGroups[0]?.maxSelections, 3)
  const bound = bindApplicationWorkflowOpportunities(spec, [
    { candidateKey: 'award', opportunityId: 'op-award' },
    { candidateKey: 'course-a', opportunityId: 'op-a' },
    { candidateKey: 'course-b', opportunityId: 'op-b' },
    { candidateKey: 'course-c', opportunityId: 'op-c' },
  ])
  assertEquals(validateApplicationWorkflowSelection(bound, ['op-award', 'op-a', 'op-b', 'op-c']), { accepted: true, selectedIds: ['op-award', 'op-a', 'op-b', 'op-c'], complete: true })
  const schedule = scheduleApplicationWorkflow(bound, [
    { targetKey: 'award', caseId: 'case-award', status: 'active', currentStage: 'document_preparation', complete: false },
    { targetKey: 'course-a', caseId: 'case-a', status: 'active', currentStage: 'document_preparation', complete: false },
    { targetKey: 'course-b', caseId: 'case-b', status: 'active', currentStage: 'document_preparation', complete: false },
    { targetKey: 'course-c', caseId: 'case-c', status: 'active', currentStage: 'document_preparation', complete: false },
  ])
  assert(schedule.runnableTargetKeys.includes('award'))
  assert(schedule.runnableTargetKeys.includes('course-a'))
  assertEquals(schedule.activeCaseId, 'case-award')
})

Deno.test('expands discovery to the official minimum without inventing target cardinality', () => {
  const spec = compileApplicationWorkflow({
    rootTarget: { key: 'award', label: 'Graduate award', targetKind: 'scholarship' },
    officialEvidence: evidence,
    raw: {
      mode: 'coupled_targets',
      targets: [{ key: 'award', label: 'Graduate award', target_kind: 'scholarship', role: 'primary', required: true, source_evidence: [evidence[0]] }],
      selection_groups: [{ id: 'courses', label: 'Choose three eligible courses', target_kind: 'course', min_selections: 3, max_selections: 3, required: true, target_keys: ['course-a', 'course-b', 'course-c'], source_evidence: [evidence[0]] }],
      edges: [],
    },
  })
  assertEquals(workflowMinimumCandidateCount(spec), 4)
  assertEquals(workflowNeedsCandidateExpansion(spec), true)
})

Deno.test('keeps discovery open when a required root target is still unbound', () => {
  const spec = compileApplicationWorkflow({
    rootTarget: { key: 'award', label: 'Graduate award', targetKind: 'scholarship' },
    officialEvidence: evidence,
    raw: {
      mode: 'coupled_targets',
      targets: [{ key: 'award', label: 'Graduate award', target_kind: 'scholarship', role: 'primary', required: true, source_evidence: [evidence[0]] }],
      selection_groups: [{ id: 'course', label: 'Choose one eligible course', target_kind: 'course', min_selections: 1, max_selections: 1, required: true, target_keys: ['course-a'], source_evidence: [evidence[0]] }],
      edges: [],
    },
  })
  const partiallyBound = bindApplicationWorkflowOpportunities(spec, [{ candidateKey: 'course-a', opportunityId: 'op-course' }])
  assertEquals(workflowNeedsCandidateExpansion(partiallyBound), true)
})

Deno.test('fails closed when official cardinality evidence is missing or the graph has a cycle', () => {
  const missingEvidence = compileApplicationWorkflow({
    rootTarget: { label: 'Scholarship', targetKind: 'scholarship' },
    officialEvidence: evidence,
    raw: { mode: 'multi_target', selection_groups: [{ id: 'courses', label: 'Choose courses', min_selections: 2, max_selections: 3, target_keys: ['a', 'b'] }] },
  })
  assertEquals(missingEvidence.status, 'needs_official_structure')
  assert(missingEvidence.blockers.length > 0)

  const cyclic = compileApplicationWorkflow({
    rootTarget: { key: 'a', label: 'A', targetKind: 'programme' },
    officialEvidence: evidence,
    raw: {
      mode: 'coupled_targets',
      targets: [
        { key: 'a', label: 'A', target_kind: 'programme', source_evidence: [evidence[0]] },
        { key: 'b', label: 'B', target_kind: 'programme', source_evidence: [evidence[1]] },
      ],
      selection_groups: [{ id: 'targets', label: 'Targets', min_selections: 1, max_selections: 2, target_keys: ['a', 'b'], source_evidence: [evidence[0]] }],
      edges: [
        { from: 'a', to: 'b', relation: 'requires', source_evidence: [evidence[0]] },
        { from: 'b', to: 'a', relation: 'requires', source_evidence: [evidence[1]] },
      ],
    },
  })
  assertEquals(cyclic.status, 'needs_official_structure')
})

Deno.test('supports a verified single-route programme without requiring a provider choice list', () => {
  const spec = compileApplicationWorkflow({
    rootTarget: { key: 'programme', label: 'MSc Computer Science', targetKind: 'programme' },
    officialEvidence: [{ id: 'admissions', url: 'https://university.example/apply', excerpt: 'Applications for the MSc Computer Science programme are submitted through this portal.', authority: 'official' }],
    raw: {
      mode: 'single_target',
      root_target_key: 'programme',
      targets: [{ key: 'programme', label: 'MSc Computer Science', target_kind: 'programme', role: 'primary', required: true, source_evidence: [{ id: 'admissions', url: 'https://university.example/apply', excerpt: 'Applications for the MSc Computer Science programme are submitted through this portal.', authority: 'official' }] }],
      selection_groups: [],
      edges: [],
    },
  })
  assertEquals(spec.status, 'verified')
  assertEquals(spec.selectionGroups[0]?.minSelections, 1)
  assertEquals(spec.selectionGroups[0]?.targetKeys, ['programme'])
})
