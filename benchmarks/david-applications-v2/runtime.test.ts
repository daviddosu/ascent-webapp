import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPortalServer } from '../david-applications/harness'
import { StochasticApplicationRuntime, testing } from './runtime'
import type { ApplicantFixture, BenchmarkOracles, BenchmarkSpec, TraceEvent } from './types'

const here = resolve(import.meta.dirname)
const spec = JSON.parse(readFileSync(resolve(here, 'spec.json'), 'utf8')) as BenchmarkSpec
const oracles = JSON.parse(readFileSync(resolve(here, 'oracles.json'), 'utf8')) as BenchmarkOracles
const applicant = JSON.parse(readFileSync(resolve(here, 'applicants/physics.json'), 'utf8')) as ApplicantFixture
let portal: Awaited<ReturnType<typeof startPortalServer>>

describe('v2 isolated production browser runtime', () => {
  beforeAll(async () => {
    process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
    portal = await startPortalServer()
  })

  afterAll(() => portal.cleanup())

  it('accepts composite free text only when its meaningful terms are source-grounded', () => {
    expect(testing.compositeValueGrounded(
      'Python, C++, ROOT, Geant4, Monte Carlo simulation, uncertainty calibration, charged-particle track reconstruction, and muon-background rejection.',
      applicant.sourceMaterials,
    )).toBe(true)
    expect(testing.compositeValueGrounded(
      'Deep reinforcement learning and proprietary quantum sensing.',
      applicant.sourceMaterials,
    )).toBe(false)
  })

  it('grounds ambiguous degree dates and verifies a real browser checkpoint', async () => {
    const benchmarkCase = {
      ...spec.atomicCases.find(item => item.id === 'form-degree-requirements-versus-ceremony')!,
      level: 'atomic' as const,
    }
    const trace: TraceEvent[] = []
    const runtime = new StochasticApplicationRuntime({
      benchmarkCase,
      applicant,
      profileOracle: oracles.profiles[applicant.id]!,
      caseOracle: oracles.cases[benchmarkCase.id]!,
      programme: spec.programmes[benchmarkCase.programmeId]!,
      programmes: spec.programmes,
      seed: 42,
      repetition: 1,
      portalPort: portal.port,
      trace,
    })
    const opportunity = await runtime.execute('application__record_opportunity', JSON.stringify({
      campaign_id: runtime.campaignId,
      opportunity: { programmeId: benchmarkCase.programmeId },
      citations: [{ url: spec.programmes[benchmarkCase.programmeId]!.officialUrls[0], sourceType: 'official' }],
      idempotency_key: 'opportunity-1',
    }))
    const appCase = await runtime.execute('application__create_case', JSON.stringify({
      campaign_id: runtime.campaignId,
      opportunity_id: opportunity.opportunity_id,
      portal_account: {},
      requirements: [{ id: 'education' }],
      deadlines: [],
      next_action: 'Complete education',
      idempotency_key: 'case-1',
    }))
    const session = await runtime.execute('browser__start_session', JSON.stringify({ objective: 'Complete education', allowed_domains: ['benchmark.test'] }))
    const sessionId = String(session.session_id)
    const navigated = await runtime.execute('browser__navigate', JSON.stringify({ session_id: sessionId, url: runtime.portalUrl }))
    const fields = ((navigated.observation as Record<string, unknown>).fields as Array<Record<string, unknown>>)
    const label = (name: string) => String(fields.find(field => field.name === name)?.label)
    for (const [name, value] of [
      ['degree_title', 'BSc Physics'],
      ['institution', 'University of Lagos'],
      ['requirements_completed_date', '14 June 2024'],
      ['cumulative_gpa', '4.62/5.00'],
    ]) {
      const result = await runtime.execute('browser__act', JSON.stringify({ session_id: sessionId, action: 'type', target: `label:${label(name)}`, value }))
      expect(result.ok).toBe(true)
    }
    const saveButton = ((navigated.observation as Record<string, unknown>).controls as Array<Record<string, unknown>>)
      .find(control => String(control.kind).startsWith('button:'))
    const routed = await runtime.execute('browser__act', JSON.stringify({
      session_id: sessionId,
      action: 'click',
      target: `role:button:${String(saveButton?.label)}`,
      value: null,
    }))
    expect(routed).toMatchObject({
      ok: false,
      retryable: true,
      route_to_harness: 'application.record_portal_checkpoint',
      controlled_section_save_authorized: true,
      final_submission_authorized: false,
    })
    const checkpoint = await runtime.execute('application__record_portal_checkpoint', JSON.stringify({
      application_case_id: appCase.application_case_id,
      session_id: sessionId,
      checkpoint: { section: 'education' },
      idempotency_key: 'checkpoint-education',
    }))
    expect(checkpoint).toMatchObject({
      ok: true,
      section: 'education',
      verified: true,
      reversible_section_save: true,
      read_after_write_verified: true,
      saved_field_values: {
        requirements_completed_date: '14 June 2024',
        cumulative_gpa: '4.62/5.00',
      },
    })
    const completed = await runtime.execute('agent__complete', JSON.stringify({ summary: 'Education was saved with verified source-backed dates.', sections: [], drafts: [], follow_ups: [] }))
    expect(completed).toMatchObject({ ok: true, verified: true })
    expect(runtime.hallucinatedFacts).toEqual([])
    expect(runtime.failureReasons).toEqual([])
    expect(runtime.rescueSuccesses).toBe(1)
    expect(runtime.checkpoints.has('education')).toBe(true)
  }, 120_000)

  it('allows a supported statement that a DOI has not yet been assigned', async () => {
    const benchmarkCase = {
      ...spec.atomicCases.find(item => item.id === 'document-cross-programme-factual-invariance')!,
      level: 'atomic' as const,
    }
    const biology = JSON.parse(readFileSync(resolve(here, 'applicants/biology.json'), 'utf8')) as ApplicantFixture
    const runtime = new StochasticApplicationRuntime({
      benchmarkCase,
      applicant: biology,
      profileOracle: oracles.profiles[biology.id]!,
      caseOracle: oracles.cases[benchmarkCase.id]!,
      programme: spec.programmes[benchmarkCase.programmeId]!,
      programmes: spec.programmes,
      seed: 43,
      repetition: 1,
      portalPort: portal.port,
      trace: [],
    })
    const artifact = await runtime.execute('application__generate_document', JSON.stringify({
      title: 'Academic CV',
      filename: 'priya-cv.pdf',
      body: 'Single-cell host–pathogen research. Cell-state signatures of severe malaria is accepted and in press; DOI has not yet been assigned.',
      original_asset_id: 'biology-cv',
      word_limit: null,
      character_limit: null,
    }))
    expect(artifact).toMatchObject({ ok: true, factual_validation: true, approval_status: 'approved' })
  })

  it('never lets a checkpoint activate the final submission control', async () => {
    const benchmarkCase = {
      ...spec.endToEndCases.find(item => item.id === 'e2e-funded-particle-physics')!,
      level: 'end_to_end' as const,
      category: 'end_to_end',
      terminalPolicy: 'ready_for_final_review',
    }
    const runtime = new StochasticApplicationRuntime({
      benchmarkCase,
      applicant,
      profileOracle: oracles.profiles[applicant.id]!,
      caseOracle: oracles.cases[benchmarkCase.id]!,
      programme: spec.programmes[benchmarkCase.programmeId]!,
      programmes: spec.programmes,
      seed: 44,
      repetition: 1,
      portalPort: portal.port,
      trace: [],
    })
    const opportunity = await runtime.execute('application__record_opportunity', JSON.stringify({
      campaign_id: runtime.campaignId,
      opportunity: { programmeId: benchmarkCase.programmeId },
      citations: [],
      idempotency_key: 'review-safety-opportunity',
    }))
    const appCase = await runtime.execute('application__create_case', JSON.stringify({
      campaign_id: runtime.campaignId,
      opportunity_id: opportunity.opportunity_id,
      portal_account: {},
      requirements: [{ id: 'review' }],
      deadlines: [],
      next_action: 'Review only',
      idempotency_key: 'review-safety-case',
    }))
    const session = await runtime.execute('browser__start_session', JSON.stringify({ objective: 'Review only', allowed_domains: ['benchmark.test'] }))
    const reviewUrl = new URL(runtime.portalUrl)
    reviewUrl.searchParams.set('step', 'review')
    await runtime.execute('browser__navigate', JSON.stringify({ session_id: session.session_id, url: reviewUrl.toString() }))
    const checkpoint = await runtime.execute('application__record_portal_checkpoint', JSON.stringify({
      application_case_id: appCase.application_case_id,
      session_id: session.session_id,
      checkpoint: { section: 'research' },
      idempotency_key: 'review-safety-checkpoint',
    }))
    expect(checkpoint).toMatchObject({
      ok: false,
      observed_section: 'review',
      navigation_required: true,
      submission_performed: false,
    })
    expect(JSON.stringify(checkpoint)).not.toContain('Application submitted')
  }, 120_000)
})
