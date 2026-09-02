import { assert, assertEquals } from 'jsr:@std/assert@1'
import { agentToolDefinitions, policyForAgentTool, validateAgentToolArguments } from './agent-tools.ts'

const proposalToolNames = [
  'application.prepare_research_proposal',
  'application.review_research_proposal',
  'application.interpret_research_proposal_feedback',
  'application.finalize_research_proposal',
  'application.record_proposal_delivery',
]

Deno.test('exposes the proposal workflow through the canonical application tool surface', () => {
  const definitions = new Set(agentToolDefinitions.map(tool => tool.name))
  for (const name of proposalToolNames) {
    assert(definitions.has(name), `${name} is missing from the canonical tool definitions`)
    assertEquals(policyForAgentTool(name).risk, 'prepare')
  }
})

Deno.test('validates proposal tool envelopes before execution', () => {
  assert(validateAgentToolArguments('application.prepare_research_proposal', {
    application_case_id: 'case-1',
    requirement: {},
    official_sources: [],
    context_sources: [],
    direction_candidates: [],
    selected_direction_id: null,
    research_dossier: {},
    methodology: {},
    writer_candidates: [],
    idempotency_key: 'proposal:prepare:1',
  }))
  assert(validateAgentToolArguments('application.record_proposal_delivery', {
    application_case_id: 'case-1',
    artifact_id: 'artifact-1',
    checksum: 'a'.repeat(64),
    filename: 'proposal.pdf',
    destination: 'Research documents',
    read_back_verified: true,
    evidence_ids: ['portal-evidence-1'],
    idempotency_key: 'proposal:delivery:1',
  }))
  assertEquals(validateAgentToolArguments('application.record_proposal_delivery', {
    application_case_id: 'case-1',
    artifact_id: 'artifact-1',
    checksum: 'not-a-checksum',
    filename: 'proposal.pdf',
    destination: 'Research documents',
    read_back_verified: true,
    evidence_ids: ['portal-evidence-1'],
    idempotency_key: 'proposal:delivery:1',
  }), false)
})

Deno.test('validates the direct-LaTeX CV envelope without the retired section-order field', () => {
  assert(validateAgentToolArguments('application.generate_cv', {
    application_case_id: 'case-1',
    filename: 'graduate-cv.pdf',
    page_target: 'one_page',
    latex_content: '\\documentclass{article}\\begin{document}CV\\end{document}',
    tailoring_brief: {
      target_institution: 'Harvard University',
      target_programme: 'Physics PhD',
      official_source_urls: ['https://physics.harvard.edu/graduate'],
      priority_signals: ['quantum optics', 'computational physics'],
      applicant_fit_fact_ids: ['fact-1', 'fact-2'],
      fit_statement: 'Evidence-backed programme fit.',
    },
    meta_prompt_version: 'graduate-cv-tailoring-v4',
    idempotency_key: 'cv:1',
  }))
})
