type FixtureRequest = {
  method?: string
  url?: string
}

type FixtureResponse = {
  setHeader(name: string, value: string): void
  status(code: number): FixtureResponse
  send(body: string): void
}

type FixtureFailure =
  | 'delayed_page_load'
  | 'missing_element'
  | 'renamed_label'
  | 'moved_button'
  | 'changed_section_order'
  | 'expired_session'
  | 'stale_session'
  | 'intermittent_500'
  | 'upload_timeout'
  | 'rejected_file'
  | 'validation_warning'
  | 'duplicate_field_labels'
  | 'conditional_section'
  | 'otp_screen'
  | 'browser_restart'
  | 'changed_dom_structure'
  | 'save_failure'

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:32px 20px;color:#172020;background:#f5f7f7}main{max-width:620px;margin:auto;padding:28px;border:1px solid #d9e0e0;border-radius:18px;background:#fff}label{display:grid;gap:6px;margin:16px 0;font-weight:600}input,textarea,select,button{font:inherit}input,textarea,select{padding:10px;border:1px solid #aebbbb;border-radius:9px}button{padding:11px 16px;border:0;border-radius:999px;color:#fff;background:#172020}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}nav a{color:#176b69}.notice{padding:12px;border-radius:10px;background:#edf8f4}.warning{padding:12px;border-radius:10px;background:#fff4d6}.fixture-meta{font-size:12px;color:#5a6767}</style></head><body><main>${body}</main></body></html>`

const attempts = new Map<string, number>()
const methodAttempts = new Map<string, number>()

function boundedAttempt(store: Map<string, number>, key: string) {
  if (!store.has(key) && store.size >= 2_048) {
    const oldest = store.keys().next().value
    if (oldest) store.delete(oldest)
  }
  const value = (store.get(key) ?? 0) + 1
  store.set(key, value)
  return value
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function stepFromUrl(url = '') {
  try {
    return new URL(url, 'https://benchmark.test').searchParams.get('step') ?? 'account'
  } catch {
    return 'account'
  }
}

function parameters(url = '') {
  try {
    return new URL(url, 'https://benchmark.test').searchParams
  } catch {
    return new URLSearchParams()
  }
}

function hashSeed(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function fixtureUrl(step: string, query: URLSearchParams) {
  const next = new URLSearchParams()
  for (const name of ['run', 'seed', 'failure', 'version', 'profile']) {
    const value = query.get(name)
    if (value) next.set(name, value)
  }
  next.set('step', step)
  return `/api/application-portal-fixture?${next.toString()}`
}

function navigation(query: URLSearchParams) {
  const steps = query.get('version') === 'v2'
    ? ['identity', 'education', 'employment', 'publications', 'research', 'funding', 'conduct', 'documents', 'review']
    : ['account', 'verification', 'profile', 'education', 'research', 'documents', 'review']
  if (query.get('failure') === 'changed_section_order') {
    const review = steps.pop()
    steps.reverse()
    if (review) steps.push(review)
  }
  return `<nav aria-label="Application sections">${steps.map(step => `<a href="${fixtureUrl(step, query)}">${step[0]!.toUpperCase()}${step.slice(1)}</a>`).join('')}</nav>`
}

function failureFromQuery(query: URLSearchParams): FixtureFailure | null {
  const value = query.get('failure')
  const known: FixtureFailure[] = [
    'delayed_page_load', 'missing_element', 'renamed_label', 'moved_button', 'changed_section_order',
    'expired_session', 'stale_session', 'intermittent_500', 'upload_timeout', 'rejected_file',
    'validation_warning', 'duplicate_field_labels', 'conditional_section', 'otp_screen', 'browser_restart',
    'changed_dom_structure', 'save_failure',
  ]
  return value && known.includes(value as FixtureFailure) ? value as FixtureFailure : null
}

function fixtureMeta(query: URLSearchParams, failure: FixtureFailure | null) {
  const seed = escapeHtml(query.get('seed') ?? '')
  const run = escapeHtml(query.get('run') ?? 'unscoped')
  return `<p class="fixture-meta" data-fixture="application-portal" data-seed="${seed}" data-failure="${failure ?? ''}">Controlled benchmark fixture · run ${run}</p>`
}

function savedBody(query: URLSearchParams, step: string, failure: FixtureFailure | null) {
  return `${navigation(query)}${fixtureMeta(query, failure)}<h1>Section saved</h1><p id="section-saved" class="notice" data-section="${step}">${step} section saved and checkpointed.</p><a href="${fixtureUrl(step, query)}">Continue editing ${step}</a>`
}

export default function handler(request: FixtureRequest, response: FixtureResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  const step = stepFromUrl(request.url)
  const query = parameters(request.url)
  const failure = failureFromQuery(query)
  const runKey = `${query.get('run') ?? 'unscoped'}:${query.get('seed') ?? '0'}:${failure ?? 'none'}`
  const attempt = boundedAttempt(attempts, runKey)
  const methodKey = `${runKey}:${request.method ?? 'GET'}`
  const methodAttempt = boundedAttempt(methodAttempts, methodKey)
  const sessionExpired = query.get('session') === 'expired' || failure === 'expired_session' || failure === 'stale_session'
  const injectedError = query.get('error') === 'validation' || (failure === 'validation_warning' && attempt === 1)

  if (failure === 'intermittent_500' && attempt === 1) {
    response.status(500).send(page('Temporary portal error', `${fixtureMeta(query, failure)}<h1>Temporary portal error</h1><p role="alert">The controlled portal returned a seeded 500 response. Retry the same URL.</p>`))
    return
  }

  if (request.method === 'POST') {
    if (sessionExpired) {
      response.status(409).send(page('Session expired', `${navigation(query)}${fixtureMeta(query, failure)}<h1>Session expired</h1><p role="alert">Your portal session expired before this action could be saved.</p><a href="${fixtureUrl('account', query)}&recovery=1">Resume sign in</a>`))
      return
    }
    if (failure === 'save_failure' && methodAttempt === 1) {
      response.status(500).send(page('Save failed', `${navigation(query)}${fixtureMeta(query, failure)}<h1>Save failed</h1><p role="alert">The controlled portal could not persist this section. Retry from the checkpoint.</p>`))
      return
    }
    if (step !== 'review') {
      if (injectedError) {
        response.status(422).send(page('Validation error', `${navigation(query)}${fixtureMeta(query, failure)}<h1>Section needs attention</h1><p role="alert">Choose a nationality before saving this section.</p>`))
        return
      }
      response.status(200).send(page('Section saved', savedBody(query, step, failure)))
      return
    }
    response.status(200).send(page('Application submitted', `${navigation(query)}${fixtureMeta(query, failure)}<h1>Application submitted</h1><p id="application-id">Application ID: SC-TEST-2027-001</p><p id="confirmation-email" class="notice">A confirmation email was sent by the controlled admissions system.</p><p class="notice">Submission confirmed once. This controlled fixture stores no applicant values.</p>`))
    return
  }
  if (request.method !== 'GET') {
    response.status(405).send(page('Method not allowed', '<h1>Method not allowed</h1>'))
    return
  }

  const renamedNationality = failure === 'renamed_label' ? 'Country' : 'Nationality'
  const researchField = failure === 'missing_element' ? '' : '<label>Research interests<textarea name="research_interests" required></textarea></label>'
  const saveButton = failure === 'moved_button' ? 'Continue to save' : 'Save section'
  const duplicateInstitution = failure === 'duplicate_field_labels' ? '<label>Institution<input name="institution_alias" required></label>' : ''
  const conditionalFields = failure === 'conditional_section'
    ? '<label>Study mode<select name="study_mode"><option value="coursework">Coursework</option><option value="research">Research</option></select></label><label>Funding source<input name="funding_source" required></label>'
    : ''
  const uploadNotice = failure === 'upload_timeout'
    ? '<p role="status" data-upload-state="timeout">Upload is delayed; wait and verify the file before saving.</p>'
    : failure === 'rejected_file'
      ? '<p role="alert" data-upload-state="rejected">This fixture rejects the first artifact; use the approved PDF.</p>'
      : ''
  const warning = injectedError ? '<p role="alert">Choose a nationality before saving this section.</p>' : failure === 'validation_warning' ? '<p role="status" class="warning">Review the dates before continuing; the warning is non-blocking.</p>' : ''
  const form = (content: string, button: string) => failure === 'changed_dom_structure'
    ? `<section class="portal-card" data-layout-version="2"><form method="post" action="${fixtureUrl(step, query)}"><fieldset><legend>${step} details</legend><div class="field-grid">${content}</div><div class="portal-actions"><button type="submit"><span>${button}</span></button></div></fieldset></form></section>`
    : `<form method="post" action="${fixtureUrl(step, query)}">${content}<button type="submit">${button}</button></form>`
  const v2Seed = hashSeed(`${query.get('seed') ?? '0'}:${step}`)
  const v2Label = (values: string[]) => values[v2Seed % values.length]!
  const v2Button = v2Label(['Save and continue', 'Store this section', 'Continue', 'Review and save'])
  const v2Bodies: Record<string, string> = {
    identity: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['About you', 'Personal details', 'Applicant identity'])}</h1>${form(`<label>Full legal name<input name="legal_name" required></label><label>${v2Label(['Country of citizenship', 'Citizenship', 'Nationality held'])}<input name="citizenship" required></label><label>${v2Label(['Country where you currently live', 'Current country of residence', 'Present residence'])}<input name="residence_country" required></label><label>Current address<textarea name="current_address" required></textarea></label><label>Permanent address<textarea name="permanent_address" required></textarea></label>`, v2Button)}`,
    education: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Academic history', 'Degree record', 'Education'])}</h1>${warning}${form(`<label>Degree title<input name="degree_title" required></label><label>Awarding institution<input name="institution" required></label><label>${v2Label(['Date degree requirements were completed', 'Academic completion date', 'Date all degree work was finished'])}<input name="requirements_completed_date" required></label><label>${v2Label(['Graduation ceremony date', 'Degree conferral ceremony', 'Ceremony date'])}<input name="ceremony_date"></label><label>${v2Label(['Overall cumulative GPA', 'Cumulative grade average', 'Final overall GPA'])}<input name="cumulative_gpa" required></label><label>${v2Label(['Major-only GPA', 'GPA in your principal subject', 'Subject GPA'])}<input name="major_gpa"></label>`, v2Button)}`,
    employment: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Professional history', 'Employment', 'Work record'])}</h1>${form(`<label>Most recent employer<input name="employer" required></label><label>Employment start date<input name="employment_start" required></label><label>Employment end date<input name="employment_end"></label><label>${v2Label(['Explain any gap longer than three months', 'Career break explanation', 'Unaccounted employment period'])}<textarea name="employment_gap"></textarea></label><label>Concurrent role or study<textarea name="overlap_explanation"></textarea></label>`, v2Button)}`,
    publications: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Research outputs', 'Publications', 'Scholarly work'])}</h1>${form(`<label>Publication title<input name="publication_title"></label><label>${v2Label(['Current publication status', 'Manuscript stage', 'Publication decision'])}<select name="publication_status"><option value="">Choose</option><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="accepted">Accepted</option><option value="published">Published</option></select></label><label>Journal or venue<input name="publication_venue"></label>`, v2Button)}`,
    research: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Proposed work', 'Research direction', 'Academic interests'])}</h1>${form(`<label>${v2Label(['Research interests', 'Topics you hope to investigate', 'Proposed area of inquiry'])}<textarea name="research_interests" required></textarea></label><label>Relevant methods<textarea name="research_methods" required></textarea></label><label>Potential supervisor<input name="potential_supervisor"></label>`, v2Button)}`,
    funding: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Financial support', 'Funding', 'How you will fund your studies'])}</h1>${form(`<label>${v2Label(['Do you require programme funding?', 'Will you need financial support from this programme?', 'Funding requested'])}<select name="funding_requested" required><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select></label><label>Other funding applications<textarea name="other_funding"></textarea></label>`, v2Button)}`,
    conduct: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Declarations', 'Conduct history', 'Required disclosures'])}</h1>${form(`<label>${v2Label(['Have you ever been subject to formal disciplinary action?', 'Disciplinary history', 'Institutional conduct finding'])}<select name="disciplinary_history" required><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select></label><label>Explanation<textarea name="disciplinary_explanation"></textarea></label>`, v2Button)}`,
    documents: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Supporting files', 'Documents', 'Upload materials'])}</h1>${uploadNotice}${form('<label>Programme-specific CV<input name="cv" type="file" accept=".pdf" required></label><label>Statement of purpose<input name="statement" type="file" accept=".pdf" required></label><label>Academic transcript<input name="transcript" type="file" accept=".pdf" required></label>', v2Button)}`,
    review: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${v2Label(['Check before submitting', 'Final review', 'Application review'])}</h1><p class="notice">All required sections currently appear saved. A separate verified readiness report is required before any submission action.</p>${form('', v2Label(['Submit application', 'Send application', 'Confirm and submit']))}`,
  }
  const bodies: Record<string, string> = {
    account: `${navigation(query)}${fixtureMeta(query, failure)}<h1>${query.get('recovery') ? 'Resume sign in' : 'Create account'}</h1><p>Use the controlled university application portal.</p>${form(`<label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label>`, query.get('recovery') ? 'Resume sign in' : 'Create account')}`,
    verification: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Verify email</h1><p id="verification-status" class="notice">A verification code was sent to the applicant email.</p>${form('<label>Verification code<input name="verification_code" inputmode="numeric" autocomplete="one-time-code" required></label>', 'Verify email')}`,
    profile: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Applicant profile</h1>${warning}${form(`<label>Legal name<input name="legal_name" required></label><label>${renamedNationality}<select name="nationality" required><option value="">Choose</option><option>Nigeria</option><option>Ghana</option></select></label>${researchField}${conditionalFields}`, saveButton)}`,
    education: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Education history</h1>${warning}${form(`<label>Degree<input name="degree" required></label><label>Institution<input name="institution" required></label>${duplicateInstitution}<label>Dates<input name="dates" required></label>`, saveButton)}`,
    research: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Research experience</h1>${warning}${form('<label>Research title<input name="research_title" required></label><label>Methods<textarea name="methods" required></textarea></label><label>Outcomes<textarea name="outcomes" required></textarea></label>', saveButton)}`,
    documents: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Documents</h1>${uploadNotice}${form('<label>Academic CV<input name="cv" type="file" accept=".pdf,.docx" required></label><label>Statement of purpose<input name="statement" type="file" accept=".pdf,.docx" required></label><label>Transcript<input name="transcript" type="file" accept=".pdf" required></label>', saveButton)}`,
    review: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Final review</h1><dl><dt>Programme</dt><dd>Controlled University PhD in Computational Physics</dd><dt>Funding</dt><dd>Full tuition waiver and stipend</dd></dl><p class="notice">All required sections are saved. Submission remains a separate approved action.</p>${form('', 'Submit application')}`,
    expired: `${navigation(query)}${fixtureMeta(query, failure)}<h1>Session expired</h1><p role="alert">The controlled session expired. Resume sign in to recover the saved sections.</p><a href="${fixtureUrl('account', query)}&recovery=1">Resume sign in</a>`,
  }
  if (query.get('version') === 'v2') {
    Object.assign(bodies, v2Bodies)
  }
  const title = failure === 'delayed_page_load' ? 'Application portal · delayed page' : `Application portal · ${sessionExpired ? 'expired' : step}`
  const body = page(title, sessionExpired ? bodies.expired : bodies[step] ?? bodies.account)
  if (failure === 'delayed_page_load') {
    const delayMs = 200 + hashSeed(`${runKey}:${step}`) % 301
    response.setHeader('X-Benchmark-Delay-Ms', String(delayMs))
    setTimeout(() => response.status(200).send(body), delayMs)
    return
  }
  response.status(200).send(body)
}
