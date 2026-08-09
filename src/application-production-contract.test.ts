import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const agent = readFileSync(resolve('supabase/functions/task-agent/index.ts'), 'utf8')
const worker = readFileSync(resolve('api/browser-worker.ts'), 'utf8')
const browser = readFileSync(resolve('api/_public-browser.ts'), 'utf8')
const app = readFileSync(resolve('src/main.ts'), 'utf8')
const browserDocs = readFileSync(resolve('docs/browser-execution.md'), 'utf8')
const qualificationRunner = readFileSync(resolve('benchmarks/david-applications/production-qualification.mjs'), 'utf8')

describe('production application completion contract', () => {
  it('sends private PNG and JPEG bytes to Luna multimodally', () => {
    expect(agent).toContain("type: 'input_image'")
    expect(agent).toContain("['image/png', 'image/jpeg']")
    expect(agent).toContain("model = 'gpt-5.6-luna'")
    expect(agent).not.toMatch(/model\s*:\s*['\"](?:sol|terra)/i)
  })

  it('generates private derived PDF assets with provenance and limits', () => {
    expect(agent).toContain("toolName === 'application.generate_document'")
    expect(agent).toContain('validateDocumentText')
    expect(agent).toContain("contentType: 'application/pdf'")
    expect(agent).toContain("source: 'roon_generated'")
    expect(agent).toContain('original_asset_id: originalAssetId')
  })

  it('offers an honest human-expert choice before drafting a graduate SOP', () => {
    expect(agent).toContain("code: 'sop_authoring_choice_required'")
    expect(agent).toContain('Bring in a human expert')
    expect(agent).toContain('Let Roon draft it')
    expect(agent).toContain('submission-ready for your approval')
    expect(agent).toContain('sop_authoring_choice')
    expect(agent).toContain('awaitingSopAuthoringChoice')
  })

  it('requires application evidence to be attached to the current task', () => {
    expect(agent).toContain("const isApplicationTask = /\\bapply\\b/i.test(title)")
    expect(agent).toContain("attachmentQuery.eq('task_id', taskId)")
    expect(agent).toContain(".eq('task_id', run.task_id)")
  })

  it('asks for the CV first when a screenshot has no attached applicant CV', () => {
    expect(agent).toContain("code: 'application_cv_required'")
    expect(agent).toContain('Please attach your current CV.')
    expect(agent).toContain("missing_fields: ['cv']")
    expect(agent).toContain('resum[eé]+')
  })

  it('materialises task-owned assets and verifies the browser file input', () => {
    expect(worker).toContain("from('file_assets')")
    expect(worker).toContain("from('private-file-assets').download")
    expect(browser).toContain('setInputFiles')
    expect(browser).toContain("kind: 'file_upload'")
    expect(browser).toContain('browser_upload_unverified')
  })

  it('blocks ready-for-review without official-page, document, and upload evidence', () => {
    expect(agent).toContain('uploads.length < generated.length')
    expect(agent).toContain('navigations.length < 2')
    expect(agent).toContain('non_luna_reasoning_calls: 0')
  })

  it('keeps natural application wording observable and tolerates source-backed programme labels', () => {
    expect(agent).toContain('isApplicationIntent(current.objective')
    expect(agent).toContain('opportunityInput.programme')
    expect(agent).toContain('citationUrlFallback')
    expect(agent).toContain("sourceTypeValue === 'government'")
    expect(agent).toContain('opportunityInput.verified === true')
    expect(agent).toContain('current.context.attachments as Array<Record<string, unknown>>).length > 0')
    expect(agent).toContain('application_context_answers')
    expect(agent).toContain('AUTHORITATIVE_APPLICATION_CONTEXT_USER_ANSWERS_V1')
    expect(agent).toContain('safeString(run.context?.application_campaign_id, 80)')
    expect(agent).toContain('application_browser_recycled_action_id')
    expect(agent).toContain("['verified', ''].includes(requestedVerification)")
    expect(agent).toContain('run.browser_session_id')
    expect(agent).toContain('model typo as a cross-task ownership failure')
    expect(agent).toContain('application_browser_history_recovered')
    expect(agent).toContain('const wwwAlias = `www.${domain}`')
    expect(agent).toContain("'www.ed.ac.uk': 'study.ed.ac.uk'")
    expect(agent).toContain('repairedDomains')
    expect(agent).toContain('const shortlistApproved =')
    expect(agent).toContain('isApplicationIntent(run.objective, safeString(run.context?.description, 4_000)) && shortlistApproved')
    expect(agent).toContain('normalizeApplicationCreateCaseArguments')
    expect(agent).toContain("select('id,official_url,application_url')")
    expect(agent).toContain('input.label ?? input.title')
    expect(agent).toContain('input.source_urls ?? input.sourceUrls')
    expect(agent).toContain('ensureOfficialRequirementEvidence')
    expect(agent).toContain("kind: 'official_requirement_source'")
    expect(agent).toContain("code: 'application_assignment_required'")
  })

  it('keeps the synthetic David qualification hosts in the documented browser allowlist', () => {
    for (const host of ['www.imperial.ac.uk', 'study.ed.ac.uk', 'web.cs.toronto.edu', 'www.grad.ubc.ca', 'www.cs.ubc.ca']) {
      expect(browserDocs).toContain(host)
    }
  })

  it('queries only columns that exist when collecting production qualification evidence', () => {
    expect(qualificationRunner).toContain('application_evidence?select=id,application_case_id,kind,source_url,provider,provider_message_id,provider_thread_id,excerpt,captured_at')
    expect(qualificationRunner).toContain('application_communications?select=id,application_case_id,provider,direction,classification,provider_message_id,provider_thread_id,created_at')
    expect(qualificationRunner).not.toContain('application_evidence?select=id,application_case_id,kind,verified')
    expect(qualificationRunner).not.toContain('application_communications?select=id,application_case_id,provider,direction,status')
  })

  it('resumes bounded browser failures against the saved production run', () => {
    expect(qualificationRunner).toContain("'browser_worker_unavailable'")
    expect(qualificationRunner).toContain("'browser_retry_exhausted'")
    expect(qualificationRunner).toContain("action: 'resume', runId, context: ''")
    expect(qualificationRunner).toContain('explicit-application-requirements')
    expect(qualificationRunner).toContain('semantic-evidence-recovery')
    expect(qualificationRunner).toContain('human-assignment-recovery')
  })

  it('recovers a stalled application turn without changing the frozen email or flight polling paths', () => {
    expect(app).toContain('const staleApplicationRuns')
    expect(app).toContain("isApplicationIntent(run.objective, run.context)")
    expect(app).toContain("['planning', 'running'].includes(run.status)")
    expect(app).toContain('const stalePaymentHandoffRuns')
    expect(app).toContain("run.capability === 'flight_search'")
    expect(app).toContain('Boolean(run.result?.paymentHandoffUrl)')
    expect(app).toContain("run.status === 'waiting_external'")
  })
})
