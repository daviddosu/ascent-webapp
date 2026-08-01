import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const agent = readFileSync(resolve('supabase/functions/task-agent/index.ts'), 'utf8')
const worker = readFileSync(resolve('api/browser-worker.ts'), 'utf8')
const browser = readFileSync(resolve('api/_public-browser.ts'), 'utf8')
const app = readFileSync(resolve('src/main.ts'), 'utf8')

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

  it('recovers a stalled application turn without changing the frozen email or flight polling paths', () => {
    expect(app).toContain('const staleApplicationRuns')
    expect(app).toContain("isApplicationIntent(run.objective, run.context)")
    expect(app).toContain("['planning', 'running'].includes(run.status)")
    expect(app).toContain("run.status === 'waiting_external'")
  })
})
