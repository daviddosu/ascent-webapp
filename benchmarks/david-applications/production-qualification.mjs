import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_REF = 'bhhutexqrxzbbhatepmh'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const APP_URL = 'https://app.shotcount.app'
const NATURAL_REQUEST = 'Find strong fully funded graduate programmes for me in my field and handle the applications end to end.'
const IMPLEMENTATION_COMMIT = '7926e39e30ed19cbce36aaac03e305e1693f99db'
const EVIDENCE_COMMIT = '8b19141defd769c8a8c96d322246d1913a9e87bd'
const MODEL = 'gpt-5.6-luna'
const SOURCE_ROOT = resolve('benchmarks/david-applications/applicant-simulations/david-applicant-qualification-20260809-failure-driven')
const SOURCE_FILES = [
  ['cv', 'nadia-okoye-cv.txt'],
  ['transcript', 'nadia-okoye-transcript.txt'],
  ['degree', 'nadia-okoye-degree.txt'],
  ['supporting', 'nadia-okoye-supporting.txt'],
]
const QUALIFICATION_PROGRAMME_SOURCES = [
  'https://www.imperial.ac.uk/computing/prospective-students/courses/phd/',
  'https://study.ed.ac.uk/programmes/postgraduate-research/489-informatics-iml-machine-learning-computational-neuroscience',
  'https://web.cs.toronto.edu/graduate/phd',
  'https://www.grad.ubc.ca/prospective-students/graduate-degree-programs/phd-computer-science',
  'https://www.cs.ubc.ca/grads/awards-support-current-grad-students/financial-assistantship/stipends-support-details-2026-2027',
]

const argv = process.argv.slice(2)
const argValue = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const requestedRuns = Math.max(1, Math.min(3, Number(argValue('--runs', '1')) || 1))
const maxMinutes = Math.max(5, Math.min(180, Number(argValue('--max-minutes', '45')) || 45))
const outputPath = argValue('--output', '')
const resumeRunId = argValue('--resume-run', '')
const qualificationStartedAt = new Date().toISOString()

function isoDateIn(timeZone = 'Africa/Lagos') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = type => parts.find(item => item.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function shortId(value) {
  return typeof value === 'string' ? value.slice(0, 12) : null
}

function redactText(value) {
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:otp|one[- ]time password|verification code)\b[^.]{0,80}/gi, '[verification detail redacted]')
    .slice(0, 600)
}

function safeError(error) {
  return redactText(error instanceof Error ? error.message : error)
}

function loadApiKeys() {
  const result = spawnSync('supabase', [
    'projects', 'api-keys', '--project-ref', PROJECT_REF, '--reveal', '--output', 'json',
  ], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('The Supabase API keys could not be loaded.')
  const parsed = JSON.parse(result.stdout)
  const rows = Array.isArray(parsed) ? parsed : (parsed.keys || [])
  const keys = Object.fromEntries(rows.map(item => [item.id, item.api_key]))
  if (!keys.anon || !keys.service_role) throw new Error('The required Supabase API keys are unavailable.')
  return { anon: keys.anon, serviceRole: keys.service_role }
}

function headers(key, extra = {}) {
  if (key && typeof key === 'object') {
    return { apikey: key.apikey, Authorization: `Bearer ${key.accessToken}`, ...extra }
  }
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra }
}

function userKey(session, keys) {
  return { apikey: keys.anon, accessToken: session.accessToken }
}

async function request(path, options = {}, key, expectJson = true) {
  const response = await fetch(path.startsWith('http') ? path : `${SUPABASE_URL}${path}`, {
    ...options,
    headers: headers(key, options.headers || {}),
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const detail = typeof body === 'string' ? body : body?.message || body?.error_description || body?.error || JSON.stringify(body)
    throw new Error(`${response.status} ${redactText(detail)}`)
  }
  return expectJson ? body : { status: response.status, headers: response.headers, body: text }
}

async function restGet(path, key) {
  return request(`/rest/v1/${path}`, { method: 'GET' }, key)
}

async function restPost(path, body, key) {
  return request(`/rest/v1/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  }, key)
}

async function restPatch(path, body, key) {
  return request(`/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  }, key)
}

async function authenticateConnectedUser(keys) {
  const integrations = await restGet('agent_integrations?provider=eq.google&status=eq.connected&select=user_id,account_email,scopes&limit=10', keys.serviceRole)
  if (!integrations.length) throw new Error('No connected Google integration is available for the qualification.')
  const connected = integrations.find(row => row.user_id === '053e1d7a-e9b5-45cb-80ad-2fd5e6d4fc93') || integrations[0]
  const generated = await request('/auth/v1/admin/generate_link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: connected.account_email, options: { redirectTo: `${APP_URL}/` } }),
  }, keys.serviceRole)
  const actionUrl = new URL(generated.action_link)
  const redirect = await fetch(actionUrl, { redirect: 'manual' })
  const location = redirect.headers.get('location')
  if (!location) throw new Error('The production magic link did not return an authenticated redirect.')
  const fragment = new URL(location).hash.replace(/^#/, '')
  const params = new URLSearchParams(fragment)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) throw new Error('The production magic link redirect did not contain a session.')
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: keys.anon, Authorization: `Bearer ${accessToken}` },
  })
  const user = await userResponse.json()
  if (!userResponse.ok || user.id !== connected.user_id) throw new Error('The production magic-link session did not resolve to the connected Google user.')
  return {
    userId: user.id,
    accountEmail: connected.account_email,
    scopesCount: Array.isArray(connected.scopes) ? connected.scopes.length : null,
    accessToken,
    refreshToken,
  }
}

function fact(value, sourceAssetIds, kind = 'uploaded_document', note = null) {
  return {
    value,
    provenance: {
      kind,
      confirmed: true,
      confidence: 'high',
      sourceAssetIds,
      sourceUrl: null,
      sourceExcerpt: null,
      retrievedAt: null,
      note,
    },
  }
}

function collection(values, sourceAssetIds, kind = 'uploaded_document') {
  return values.map(value => fact(value, sourceAssetIds, kind))
}

function buildProfile(userId, assetIds, now) {
  const cv = assetIds.cv ? [assetIds.cv] : []
  const transcript = assetIds.transcript ? [assetIds.transcript] : []
  const supporting = assetIds.supporting ? [assetIds.supporting] : []
  const consent = { granted: true, grantedAt: now, scope: 'application_tasks', revokedAt: null }
  return {
    id: crypto.randomUUID(),
    userId,
    schemaVersion: 1,
    legalName: fact('Nadia Okoye', cv),
    preferredName: null,
    contactInformation: {
      email: fact('nadia.okoye@example.test', cv),
      phone: null,
      address: fact('Lagos, Nigeria', cv),
    },
    nationality: fact('Nigeria', cv),
    residency: fact('Lagos, Nigeria', cv),
    education: [
      fact({ institution: 'University of Lagos', degree: 'BSc', field: 'Physics', startDate: null, endDate: '2021-07-30', grade: 'First Class', country: 'Nigeria' }, cv),
      fact({ institution: 'University of Lagos', degree: 'MSc', field: 'Computational Physics', startDate: null, endDate: '2024-06-28', grade: 'Distinction', country: 'Nigeria' }, transcript, 'uploaded_document'),
    ],
    employment: [fact({ employer: 'Delta Systems Lab', title: 'Research Engineer', startDate: '2022', endDate: '2025', responsibilities: ['Developed uncertainty-aware surrogate models for a climate simulation pipeline.'] }, supporting)],
    researchExperience: [fact({ title: 'Surrogate models for turbulent flow', institution: null, summary: 'Surrogate models for turbulent flow.', methods: ['numerical simulation'], outcomes: [], startDate: null, endDate: null }, cv), fact({ title: 'Uncertainty-aware numerical simulation', institution: null, summary: 'Uncertainty-aware numerical simulation.', methods: ['uncertainty quantification'], outcomes: [], startDate: null, endDate: null }, cv)],
    projects: collection(['Open-source finite-volume solver', 'Climate downscaling benchmark'], cv),
    publications: [],
    awards: [],
    leadershipExperience: [],
    volunteering: [],
    skills: collection(['Python', 'Julia', 'PyTorch', 'HPC', 'numerical methods', 'LaTeX'], cv),
    testScores: [],
    researchInterests: collection(['surrogate models for turbulent flow', 'uncertainty-aware numerical simulation'], cv),
    careerGoals: [],
    geographicPreferences: [],
    fundingRequirements: [],
    programmePreferences: [],
    professors: [],
    referees: [
      fact({ name: 'Dr. Amina Bello', email: 'amina.bello@simulated.test', institution: null, relationship: 'MSc supervisor', specialty: null, providerContactId: null }, [], 'user_statement', 'controlled synthetic applicant profile'),
      fact({ name: 'Dr. Samuel Adeyemi', email: 'samuel.adeyemi@simulated.test', institution: null, relationship: 'Research Engineer manager', specialty: null, providerContactId: null }, [], 'user_statement', 'controlled synthetic applicant profile'),
      fact({ name: 'Professor Grace Nwosu', email: 'grace.nwosu@simulated.test', institution: null, relationship: 'Undergraduate project supervisor', specialty: null, providerContactId: null }, [], 'user_statement', 'controlled synthetic applicant profile'),
    ],
    reusableStories: [],
    identityDocumentMetadata: [],
    consent,
    createdAt: now,
    updatedAt: now,
  }
}

async function seedTaskAndDocuments(session, keys, runNumber) {
  const taskId = crypto.randomUUID()
  const title = NATURAL_REQUEST
  const description = `${NATURAL_REQUEST} For this controlled production qualification, evaluate exactly three suitable graduate applications using the supplied synthetic applicant evidence. Use the three canonical official programme sources first: ${QUALIFICATION_PROGRAMME_SOURCES.slice(0, 3).join(', ')}. If the Imperial source returns an access-blocked 403, do not retry it repeatedly; replace that one option with the official University of British Columbia Computer Science PhD programme and funding pages: ${QUALIFICATION_PROGRAMME_SOURCES.slice(3).join(', ')}. When preparing portal sections, use only the controlled production portal fixture at ${APP_URL}/api/application-portal-fixture?version=v2 with a unique run and seed; do not navigate to or submit a real university portal. Do not make any payment.`
  const dueDate = isoDateIn('Africa/Lagos')
  await restPost('tasks', {
    id: taskId,
    user_id: session.userId,
    title,
    description,
    due_date: dueDate,
    due_time: null,
    priority: 'high',
    estimate_minutes: 1440,
    recurrence: 'none',
    top_three: true,
    position: 0,
    last_carry_reason: '',
    visibility: 'private',
  }, userKey(session, keys))

  const assetIds = {}
  const assetEvidence = []
  for (const [kind, filename] of SOURCE_FILES) {
    const bytes = readFileSync(resolve(SOURCE_ROOT, filename))
    const assetId = crypto.randomUUID()
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageKey = `${session.userId}/${assetId}/${safeName}`
    await request(`/storage/v1/object/private-file-assets/${session.userId}/${assetId}/${safeName}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-upsert': 'false' },
      body: bytes,
    }, userKey(session, keys), false)
    await restPost('file_assets', {
      id: assetId,
      user_id: session.userId,
      task_id: taskId,
      original_filename: filename,
      mime_type: 'text/plain',
      storage_key: storageKey,
      size_bytes: bytes.byteLength,
      checksum: digest(bytes),
      source: 'task_upload',
      reusable: false,
      asset_kind: 'immutable_original',
    }, userKey(session, keys))
    assetIds[kind] = assetId
    assetEvidence.push({ id: assetId, kind, filename, sizeBytes: bytes.byteLength, sha256: digest(bytes) })
  }

  const existingProfile = await restGet(`applicant_profiles?user_id=eq.${encodeURIComponent(session.userId)}&select=id,consent_granted,updated_at,profile`, userKey(session, keys))
  let profileSeeded = false
  if (!existingProfile.length) {
    const now = new Date().toISOString()
    const profile = buildProfile(session.userId, assetIds, now)
    await restPost('applicant_profiles', {
      id: profile.id,
      user_id: session.userId,
      schema_version: 1,
      profile,
      consent: profile.consent,
      consent_granted: true,
    }, userKey(session, keys))
    profileSeeded = true
  } else {
    const existing = existingProfile[0]
    const existingProfileValue = existing?.profile && typeof existing.profile === 'object' && !Array.isArray(existing.profile)
      ? existing.profile
      : {}
    if (!Array.isArray(existingProfileValue.referees) || !existingProfileValue.referees.length) {
      const now = new Date().toISOString()
      const seeded = buildProfile(session.userId, assetIds, now)
      await restPatch(`applicant_profiles?user_id=eq.${encodeURIComponent(session.userId)}`, {
        profile: { ...existingProfileValue, referees: seeded.referees, updatedAt: now },
        updated_at: now,
      }, userKey(session, keys))
      profileSeeded = true
    }
  }
  return { taskId, title, description, dueDate, assetIds, assetEvidence, profileSeeded, runNumber }
}

function taskAgentHeaders(accessToken, anon) {
  return { apikey: anon, Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }
}

async function callTaskAgent(session, keys, body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/task-agent`, {
    method: 'POST',
    headers: taskAgentHeaders(session.accessToken, keys.anon),
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = { raw: text } }
  if (!response.ok) {
    const detail = payload?.error || payload?.message || payload?.raw || `HTTP ${response.status}`
    throw new Error(`task-agent ${response.status}: ${redactText(detail)}`)
  }
  return payload
}

function factAnswer(waitingReason) {
  const value = String(waitingReason || '').toLocaleLowerCase()
  if (/phone|telephone|mobile/.test(value)) return { key: 'phone', value: '+234 803 555 0198' }
  if (/career|goal|future|aspir/.test(value)) return { key: 'career-goal', value: 'Lead an applied research group building reliable computational tools for climate and physical science.' }
  if (/requirements? completed|completion date|degree.*(?:complete|completion)|completed.*degree/.test(value)) return { key: 'degree-requirements-completed', value: '2024-06-28' }
  if (/referee|reference|recommender/.test(value)) return { key: 'primary-referee-identity', value: 'For this controlled qualification, the authorised referee is Dr. Amina Bello (amina.bello@simulated.test), my MSc supervisor. I authorise David to contact her for the application.' }
  if (/professor|supervisor|research area|preferred area|speciali[sz]ation/.test(value)) return { key: 'preferred-research-area', value: 'scientific machine learning and uncertainty quantification' }
  if (/funding|stipend|tuition/.test(value)) return { key: 'funding-requirement', value: 'I can only accept a programme with tuition coverage and a living stipend.' }
  if (/country|geograph|location|where/.test(value)) return { key: 'geographic-preference', value: 'United Kingdom and Canada' }
  return null
}

function contextAnswer(waitingReason) {
  const value = String(waitingReason || '').toLocaleLowerCase()
  if (/shortlist|strategy approval|approve the (?:exact )?(?:three|selected)|approve.*programme|approve creating|controlled .*case|no real-portal submission|no payment|create (?:the )?application cases|create cases|all three|proceed with|first controlled application case|top-ranked/.test(value)) {
    return { key: 'shortlist-approval', value: 'I approve the exact three verified applications and the proposed controlled qualification strategy.' }
  }
  if (/semantic decision|evidence_invalid|semantic.*evidence|no web\/browser provider|requires web evidence|official .*evidence|evidence.*retriev/.test(value)) {
    return { key: 'semantic-evidence-recovery', value: 'Use the persisted official requirement evidence from the verified programme sources. Cite only evidence IDs supplied in the current controller context and continue the controlled qualification.' }
  }
  const factAnswerValue = factAnswer(waitingReason)
  if (factAnswerValue) return factAnswerValue
  if (/which .*programme should be created first|which .*created first|which .*first/.test(value)) {
    return { key: 'case-order', value: 'Create the UBC Computer Science PhD case first, then the University of Toronto Computer Science PhD case, then the University of Edinburgh IML case. Complete the controlled qualification for all three.' }
  }
  if (/campaign .*could not be found|campaign .*missing|invalid campaign/.test(value)) {
    return { key: 'campaign-recovery', value: 'Continue this same AgentRun using its canonical production campaign and the exact approved three-programme shortlist.' }
  }
  if (/required application item|application requirements?|requirements?.*(?:case|explicit)|explicitly before creating the case/.test(value)) {
    return { key: 'explicit-application-requirements', value: 'Create the controlled application case with every required item represented explicitly from the verified official programme sources. Use the existing approved shortlist and do not ask the same question again.' }
  }
  if (/human assignment|deadline monitor|monitor .*deadline/.test(value)) {
    return { key: 'human-assignment-recovery', value: 'Do not queue a deadline monitor without an existing human assignment. Continue the controlled application preparation step, or create the explicit assignment before requesting Roon monitoring.' }
  }
  if (/statement of purpose|sop authoring|human expert|writer choice/.test(value)) {
    return { key: 'sop-authoring-choice', value: 'Bring in a human expert for the controlled qualification.' }
  }
  return null
}

function applicationCampaignId(run) {
  return String(
    run?.application_state?.campaignId
      || run?.application_state?.campaign_id
      || run?.applicationState?.campaignId
      || run?.applicationState?.campaign_id
      || run?.context?.application_campaign_id
      || run?.context?.applicationCampaignId
      || '',
  ).trim()
}

async function contextAnswerForRun(waitingReason, run, session, keys) {
  const directAnswer = contextAnswer(waitingReason)
  if (directAnswer) return directAnswer

  const value = String(waitingReason || '').toLocaleLowerCase()
  if (!/durable opportunity id|opportunity ids|opportunity records/.test(value)) return null

  const campaignId = applicationCampaignId(run)
  if (!campaignId) {
    return {
      key: 'opportunity-id-recovery',
      value: 'Use the durable opportunity records already persisted for this AgentRun campaign. Do not invent or replace opportunity IDs.',
    }
  }

  const rows = await restGet(
    `application_opportunities?campaign_id=eq.${encodeURIComponent(campaignId)}&select=id,programme_title,institution&order=created_at.asc`,
    userKey(session, keys),
  )
  const entries = rows
    .filter(row => typeof row?.id === 'string')
    .map(row => `${row.institution || 'Programme'} — ${row.programme_title || 'verified programme'}: ${row.id}`)
  return {
    key: 'opportunity-id-recovery',
    value: entries.length
      ? `Use these durable opportunity IDs from the current approved campaign, in the listed programme order: ${entries.join('; ')}. Create only these three application cases and do not invent or replace their IDs.`
      : 'The current approved campaign has no durable opportunity rows yet. Re-read the persisted campaign opportunities before creating application cases; do not invent IDs.',
  }
}

function payloadHasDisallowedSideEffect(payload) {
  const text = JSON.stringify(payload || {}).toLocaleLowerCase()
    .replace(/\b(?:no|without|never|do not|don't|does not|doesn't|not)\b[^.!?]{0,160}\b(?:payment|purchase|transaction|application fee)\b/g, '')
  return /payment|credit card|card number|cvv|bank account|financial transaction|application fee/.test(text)
}

function controlledEmailPayload(payload) {
  const text = JSON.stringify(payload || '').toLocaleLowerCase()
  if (payloadHasDisallowedSideEffect(payload)) return false
  return /@(?:simulated\.test|example\.test|simulated\.[a-z0-9.-]+\.test)/.test(text)
}

function controlledFixturePayload(payload) {
  const text = JSON.stringify(payload || '').toLocaleLowerCase()
  return text.includes('application-portal-fixture') && !payloadHasDisallowedSideEffect(payload)
}

async function ownRun(session, keys, runId) {
  const rows = await restGet(`agent_runs?id=eq.${encodeURIComponent(runId)}&select=id,task_id,status,error_code,error,waiting_reason,application_state,context,reasoning_model,openai_response_id,current_step,updated_at,completed_at,result`, userKey(session, keys))
  return rows[0] || null
}

async function pendingHandoff(session, keys, runId) {
  const rows = await restGet(`application_inter_agent_requests?agent_run_id=eq.${encodeURIComponent(runId)}&status=eq.waiting_user&select=id,status,request_kind,result,payload,updated_at&order=updated_at.desc&limit=5`, userKey(session, keys))
  return rows[0] || null
}

async function pendingApprovals(session, keys, runId) {
  return restGet(`agent_approvals?run_id=eq.${encodeURIComponent(runId)}&status=eq.pending&select=id,kind,version,title,summary,payload,updated_at&order=updated_at.asc`, userKey(session, keys))
}

function runStateSummary(run) {
  return {
    status: run?.status || 'unknown',
    errorCode: run?.error_code || run?.errorCode || null,
    currentStep: run?.current_step ?? run?.currentStep ?? null,
    reasoningModel: run?.reasoning_model || run?.reasoningModel || MODEL,
    applicationState: run?.application_state ? {
      status: run.application_state.status || null,
      stage: run.application_state.stage || null,
      campaignId: run.application_state.campaignId || null,
      currentCaseId: run.application_state.currentCaseId || null,
      progress: run.application_state.progress || null,
    } : null,
    updatedAt: run?.updated_at || run?.updatedAt || null,
    completedAt: run?.completed_at || run?.completedAt || null,
    waitingReason: redactText(run?.waiting_reason || run?.waitingReason || ''),
    error: redactText(run?.error || ''),
  }
}

function waitingReasonOf(run) {
  return String(run?.waiting_reason || run?.waitingReason || '')
}

function errorCodeOf(run) {
  return run?.error_code || run?.errorCode || null
}

async function collectEvidence(session, keys, runId, taskId) {
  const evidence = { runId, taskId, model: MODEL, tables: {}, usage: null }
  const read = async (name, path, mapper = value => value) => {
    try {
      const rows = await restGet(path, userKey(session, keys))
      evidence.tables[name] = rows.map(mapper)
      return rows
    } catch (error) {
      evidence.tables[name] = { error: safeError(error) }
      return []
    }
  }
  const runs = await read('agent_runs', `agent_runs?id=eq.${encodeURIComponent(runId)}&select=id,status,reasoning_model,openai_response_id,current_step,error_code,created_at,updated_at,completed_at,application_state,result`)
  const campaigns = await read('application_campaigns', `application_campaigns?task_id=eq.${encodeURIComponent(taskId)}&select=id,status,target_quantity,objective,next_action,progress,created_at,updated_at`)
  const campaignIds = campaigns.map(row => row.id).filter(Boolean)
  const campaignFilter = campaignIds.length ? `&campaign_id=in.(${campaignIds.join(',')})` : '&campaign_id=eq.00000000-0000-0000-0000-000000000000'
  const opportunities = await read('application_opportunities', `application_opportunities?select=id,campaign_id,institution,programme_title,official_url,verification_status,confidence,fit_score,retrieved_at${campaignFilter}`)
  const caseFilter = opportunities.length ? `&opportunity_id=in.(${opportunities.map(row => row.id).join(',')})` : '&opportunity_id=eq.00000000-0000-0000-0000-000000000000'
  const cases = await read('application_cases', `application_cases?select=id,campaign_id,opportunity_id,current_stage,status,application_id,submitted_at,portal_session_id,next_action,updated_at${campaignFilter}`)
  const caseIds = cases.map(row => row.id).filter(Boolean)
  const caseIn = caseIds.length ? `in.(${caseIds.join(',')})` : 'eq.00000000-0000-0000-0000-000000000000'
  await read('application_requirements', `application_requirements?select=id,application_case_id,name,category,status,responsible_party,linked_artifact_id,verification_evidence_ids,blocker_reason,updated_at&application_case_id=${caseIn}`)
  const artifacts = await read('application_artifacts', `application_artifacts?select=id,file_asset_id,application_case_id,kind,checksum,approval_status,author_type,created_at&application_case_id=${caseIn}`)
  await read('portal_checkpoints', `portal_checkpoints?select=id,application_case_id,portal,section,verified,session_information,created_at&application_case_id=${caseIn}`)
  await read('application_evidence', `application_evidence?select=id,application_case_id,kind,source_url,provider,provider_message_id,provider_thread_id,excerpt,captured_at&application_case_id=${caseIn}`)
  await read('application_communications', `application_communications?select=id,application_case_id,provider,direction,classification,provider_message_id,provider_thread_id,created_at&application_case_id=${caseIn}`)
  await read('application_inter_agent_requests', `application_inter_agent_requests?select=id,application_case_id,request_kind,status,provider_action_id,created_at,updated_at&agent_run_id=eq.${encodeURIComponent(runId)}`)
  await read('browser_execution_sessions', `browser_execution_sessions?select=id,status,current_domain,current_url,worker_session_id,payment_boundary_reached,created_at,updated_at&run_id=eq.${encodeURIComponent(runId)}`)
  await read('agent_actions', `agent_actions?select=id,step_index,tool_name,risk,status,provider_action_id,error_code,public_summary,started_at,completed_at&run_id=eq.${encodeURIComponent(runId)}&order=step_index.asc`)
  await read('agent_approvals', `agent_approvals?select=id,kind,status,version,decided_at,created_at&run_id=eq.${encodeURIComponent(runId)}&order=created_at.asc`)
  const events = await read('agent_run_events', `agent_run_events?select=id,event_type,status,created_at,metadata&run_id=eq.${encodeURIComponent(runId)}&order=id.asc`)
  const usage = {}
  for (const event of events) {
    const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {}
    const item = metadata.usage
    if (!item || typeof item !== 'object') continue
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'number') usage[key] = (usage[key] || 0) + value
      if (value && typeof value === 'object') {
        usage[key] = usage[key] || {}
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (typeof nestedValue === 'number') usage[key][nestedKey] = (usage[key][nestedKey] || 0) + nestedValue
        }
      }
    }
  }
  evidence.usage = usage
  evidence.metrics = {
    opportunityCount: opportunities.length,
    caseCount: cases.length,
    artifactCount: artifacts.length,
    portalCheckpointCount: (evidence.tables.portal_checkpoints || []).length,
    evidenceCount: (evidence.tables.application_evidence || []).length,
    communicationCount: (evidence.tables.application_communications || []).length,
    browserSessionCount: (evidence.tables.browser_execution_sessions || []).length,
    actionCount: (evidence.tables.agent_actions || []).length,
    approvalCount: (evidence.tables.agent_approvals || []).length,
    modelResponseCount: events.filter(event => event.event_type === 'agent_model_response').length,
    failureEventCount: events.filter(event => event.status === 'failed' || event.event_type.includes('failed')).length,
  }
  evidence.tables.agent_run_events = events.map(event => {
    const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {}
    return {
      id: event.id,
      eventType: event.event_type,
      status: event.status,
      createdAt: event.created_at,
      metadataKeys: Object.keys(metadata).sort(),
      responseId: typeof metadata.response_id === 'string' ? metadata.response_id : null,
      model: typeof metadata.model === 'string' ? metadata.model : null,
      iteration: typeof metadata.iteration === 'number' ? metadata.iteration : null,
      failureTaxonomy: typeof metadata.failure_taxonomy === 'string' ? metadata.failure_taxonomy : null,
      recoveryAttempt: typeof metadata.recovery_attempt === 'number' ? metadata.recovery_attempt : null,
    }
  })
  return evidence
}

async function executeRun(session, keys, task, runNumber, existingRun = null) {
  const record = {
    runNumber,
    startedAt: new Date().toISOString(),
    task: { id: task.taskId, title: task.title, dueDate: task.dueDate, assetEvidence: task.assetEvidence, profileSeeded: task.profileSeeded },
    events: [],
    contextAnswers: [],
    approvals: [],
    blockers: [],
    final: null,
    evidence: null,
  }
  const mark = (event, detail = {}) => {
    const item = { at: new Date().toISOString(), event, ...detail }
    record.events.push(item)
    const suffix = detail.status ? ` status=${detail.status}` : ''
    console.log(`[qualification run ${runNumber}] ${event}${suffix}`)
  }
  let run = existingRun
  let browserRecoveryAttempts = 0
  if (run) {
    mark('resuming_existing', { runId: run.id, status: run.status, model: run.reasoning_model || run.reasoningModel || MODEL })
    if (run.status === 'needs_approval' && !(await pendingApprovals(session, keys, run.id)).length) {
      // A stale approval replay can leave the run marked needs_approval after
      // its approval row was already decided. Give the production recovery
      // path one explicit resume turn so the server can validate the
      // provider-confirmed action and reset that stale model transcript.
      mark('resuming_stale_approval_state', {})
      run = await callTaskAgent(session, keys, { action: 'resume', runId: run.id, context: '' })
    }
  } else {
    try {
      run = await callTaskAgent(session, keys, {
        action: 'start',
        taskId: task.taskId,
        title: task.title,
        description: task.description,
        context: '',
        capability: 'application',
        specialistId: 'david',
        specialistVersion: 'david@1',
        taskContract: 'applications.planning',
        routingSource: 'production_qualification',
        due: task.dueDate,
        timezone: 'Africa/Lagos',
      })
      mark('started', { runId: run.id, status: run.status, model: run.reasoningModel || MODEL })
    } catch (error) {
      record.blockers.push({ kind: 'start_error', message: safeError(error) })
      mark('start_failed', { message: safeError(error) })
      record.finishedAt = new Date().toISOString()
      return record
    }
  }

  const runId = run.id
  const deadline = Date.now() + maxMinutes * 60_000
  let recoveryAttempts = 0
  let unknownContextAttempts = 0
  let approvalVisibilityRetries = 0
  let modelRateLimitRetries = 0
  const contextAnswerCounts = new Map()
  while (Date.now() < deadline) {
    if (!run || !run.status) run = await ownRun(session, keys, runId)
    if (!run) throw new Error('The production AgentRun disappeared.')
    if (['completed', 'cancelled'].includes(run.status)) break

    if (run.status === 'needs_context') {
      const waitingReason = waitingReasonOf(run)
      const answer = await contextAnswerForRun(waitingReason, run, session, keys)
      if (!answer) {
        unknownContextAttempts += 1
        record.blockers.push({ kind: 'unmapped_context', waitingReason: redactText(waitingReason) })
        mark('blocked_on_context', { status: run.status, waitingReason: redactText(waitingReason) })
        if (unknownContextAttempts >= 1) break
      } else {
        unknownContextAttempts = 0
        const answerCount = (contextAnswerCounts.get(answer.key) || 0) + 1
        contextAnswerCounts.set(answer.key, answerCount)
        if (answerCount > 3) {
          record.blockers.push({ kind: 'repeated_context_request', key: answer.key, waitingReason: redactText(waitingReason) })
          mark('stopped_on_repeated_context', { key: answer.key })
          break
        }
        record.contextAnswers.push({ key: answer.key, answer: answer.value })
        mark('answered_context', { key: answer.key })
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, context: answer.value })
        } catch (error) {
          record.blockers.push({ kind: 'context_resume_error', message: safeError(error) })
          mark('context_resume_failed', { message: safeError(error) })
          break
        }
        continue
      }
    }

    if (run.status === 'waiting_for_user' || run.status === 'needs_approval') {
      const handoff = await pendingHandoff(session, keys, runId)
      if (handoff) {
        if (payloadHasDisallowedSideEffect(handoff) || (handoff.request_kind !== 'search_otp' && !controlledEmailPayload(handoff))) {
          record.blockers.push({ kind: 'uncontrolled_application_handoff', requestId: handoff.id, requestKind: handoff.request_kind })
          mark('stopped_before_uncontrolled_handoff', { requestKind: handoff.request_kind })
          break
        }
        record.approvals.push({ type: 'application_handoff', id: handoff.id, requestKind: handoff.request_kind, status: handoff.status })
        mark('approved_application_handoff', { requestKind: handoff.request_kind })
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, applicationApproval: true })
        } catch (error) {
          record.blockers.push({ kind: 'handoff_approval_error', message: safeError(error) })
          mark('handoff_approval_failed', { message: safeError(error) })
          break
        }
        continue
      }
      const approvals = await pendingApprovals(session, keys, runId)
      if (approvals.length) {
        approvalVisibilityRetries = 0
        const approval = approvals[0]
        if (approval.kind === 'browser_submit') {
          if (!controlledFixturePayload(approval.payload)) {
            record.blockers.push({ kind: 'live_submission_safety_boundary', approvalId: approval.id, approvalKind: approval.kind, summary: redactText(approval.summary) })
            mark('stopped_before_live_submission', { approvalKind: approval.kind })
            break
          }
        }
        if (approval.kind === 'send_email' && !controlledEmailPayload(approval)) {
          record.blockers.push({ kind: 'uncontrolled_email_safety_boundary', approvalId: approval.id, summary: redactText(approval.summary) })
          mark('stopped_before_uncontrolled_email', { approvalKind: approval.kind })
          break
        }
        if (payloadHasDisallowedSideEffect(approval)) {
          record.blockers.push({ kind: 'financial_safety_boundary', approvalId: approval.id, approvalKind: approval.kind })
          mark('stopped_before_financial_action', { approvalKind: approval.kind })
          break
        }
        record.approvals.push({ type: 'agent_approval', id: approval.id, approvalKind: approval.kind, version: approval.version, status: 'approved' })
        mark('approved_provider_action', { approvalKind: approval.kind })
        try {
          run = await callTaskAgent(session, keys, { action: 'approve', runId, approvalId: approval.id, approvalVersion: approval.version })
        } catch (error) {
          record.blockers.push({ kind: 'approval_error', message: safeError(error) })
          mark('provider_approval_failed', { message: safeError(error) })
          break
        }
        continue
      }
      // Approval creation and the run status update are separate durable
      // writes. A poll can briefly observe needs_approval before the pending
      // row is visible; do not turn that propagation window into a false
      // qualification blocker.
      if (run.status === 'needs_approval' && approvalVisibilityRetries < 5) {
        approvalVisibilityRetries += 1
        mark('waiting_for_approval_record', { attempt: approvalVisibilityRetries })
        await new Promise(resolveDelay => setTimeout(resolveDelay, 2_000))
        run = await ownRun(session, keys, runId)
        continue
      }
      if (run.status === 'needs_approval') {
        approvalVisibilityRetries = 0
        mark('resuming_stale_approval_state', {})
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, context: '' })
        } catch (error) {
          record.blockers.push({ kind: 'stale_approval_resume_error', message: safeError(error) })
          mark('stale_approval_resume_failed', { message: safeError(error) })
          break
        }
        continue
      }
      const waiting = waitingReasonOf(run).toLocaleLowerCase()
      if (/statement of purpose|sop authoring|human expert|writer choice/.test(waiting)) {
        record.contextAnswers.push({ key: 'sop-authoring-choice', answer: 'Bring in a human expert for the controlled qualification.' })
        mark('answered_sop_authoring_choice', { choice: 'human_expert' })
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, context: 'Bring in a human expert for the controlled qualification.' })
        } catch (error) {
          record.blockers.push({ kind: 'sop_choice_error', message: safeError(error) })
          mark('sop_choice_failed', { message: safeError(error) })
          break
        }
        continue
      }
      const browserRecoveryRequired = [
        'browser_worker_unavailable',
        'browser_retry_exhausted',
        'browser_target_closed',
        'browser_domain_not_allowed',
        'browser_sensitive_field_blocked',
        'browser_session_missing',
        'portal_checkpoint_invalid',
      ].includes(errorCodeOf(run)) || /browser session (?:is unavailable|is no longer available)|task-owned browser session|portal checkpoint needs|browser worker|browser runtime closed/i.test(waiting)
      if (browserRecoveryRequired) {
        if (browserRecoveryAttempts >= 3) {
          record.blockers.push({ kind: 'browser_recovery_budget_exhausted', errorCode: errorCodeOf(run) })
          mark('stopped_on_browser_recovery_budget', { errorCode: errorCodeOf(run) })
          break
        }
        browserRecoveryAttempts += 1
        mark('resuming_browser_failure', { attempt: browserRecoveryAttempts, errorCode: errorCodeOf(run) })
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, context: '' })
        } catch (error) {
          record.blockers.push({ kind: 'browser_resume_error', message: safeError(error) })
          mark('browser_resume_failed', { message: safeError(error) })
          break
        }
        continue
      }
      if (/shortlist|strategy approval|approve the (?:exact )?(?:three|selected)|approve.*programme/.test(waiting)) {
        record.contextAnswers.push({ key: 'shortlist-approval', answer: 'I approve the exact three verified applications and the proposed controlled qualification strategy.' })
        mark('approved_shortlist_strategy', {})
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, context: 'I approve the exact three verified applications and the proposed controlled qualification strategy.' })
        } catch (error) {
          record.blockers.push({ kind: 'shortlist_approval_error', message: safeError(error) })
          mark('shortlist_approval_failed', { message: safeError(error) })
          break
        }
        continue
      }
      const recoveryAnswer = await contextAnswerForRun(waitingReasonOf(run), run, session, keys)
      if (recoveryAnswer) {
        const answerCount = (contextAnswerCounts.get(recoveryAnswer.key) || 0) + 1
        contextAnswerCounts.set(recoveryAnswer.key, answerCount)
        if (answerCount > 3) {
          record.blockers.push({ kind: 'repeated_context_request', key: recoveryAnswer.key, waitingReason: redactText(waitingReasonOf(run)) })
          mark('stopped_on_repeated_context', { key: recoveryAnswer.key })
          break
        }
        record.contextAnswers.push({ key: recoveryAnswer.key, answer: recoveryAnswer.value })
        mark('answered_context', { key: recoveryAnswer.key })
        try {
          run = await callTaskAgent(session, keys, { action: 'resume', runId, context: recoveryAnswer.value })
        } catch (error) {
          record.blockers.push({ kind: 'context_resume_error', message: safeError(error) })
          mark('context_resume_failed', { message: safeError(error) })
          break
        }
        continue
      }
      record.blockers.push({ kind: 'waiting_for_user', waitingReason: redactText(waitingReasonOf(run)) })
      mark('blocked_on_user', { status: run.status, waitingReason: redactText(waitingReasonOf(run)) })
      break
    }

    if (run.status === 'failed') {
      if (recoveryAttempts >= 2) {
        record.blockers.push({ kind: 'production_failure', errorCode: errorCodeOf(run), message: redactText(run.error) })
        mark('failed_after_recovery_budget', { errorCode: errorCodeOf(run) })
        break
      }
      recoveryAttempts += 1
      mark('resuming_failed_run', { attempt: recoveryAttempts, errorCode: errorCodeOf(run) })
      try {
        run = await callTaskAgent(session, keys, { action: 'resume', runId, context: '' })
      } catch (error) {
        record.blockers.push({ kind: 'failure_resume_error', message: safeError(error) })
        mark('failure_resume_failed', { message: safeError(error) })
        break
      }
      continue
    }

    const snapshot = await ownRun(session, keys, runId)
    const summary = runStateSummary(snapshot || run)
    if (record.events.at(-1)?.status !== summary.status) mark('state', summary)
    try {
      run = await callTaskAgent(session, keys, { action: 'poll', runId })
      if (run.status !== summary.status) mark('polled', { status: run.status })
    } catch (error) {
      const message = safeError(error)
      if (/rate limit|tokens per min|too many requests|\b429\b/i.test(message) && modelRateLimitRetries < 5) {
        modelRateLimitRetries += 1
        mark('model_rate_limit_retry', { attempt: modelRateLimitRetries })
        await new Promise(resolveDelay => setTimeout(resolveDelay, 5_000))
        run = await ownRun(session, keys, runId)
        if (run?.status === 'failed') {
          try {
            run = await callTaskAgent(session, keys, { action: 'resume', runId, context: '' })
          } catch (resumeError) {
            record.blockers.push({ kind: 'rate_limit_resume_error', message: safeError(resumeError) })
            mark('rate_limit_resume_failed', { message: safeError(resumeError) })
            break
          }
        }
        continue
      }
      record.blockers.push({ kind: 'poll_error', message })
      mark('poll_failed', { message })
      break
    }
    const currentWaitingReason = waitingReasonOf(run).toLocaleLowerCase()
    if (run.status === 'waiting_external') await new Promise(resolveDelay => setTimeout(resolveDelay, 10_000))
    else if (run.status === 'planning' && /rate limit|temporarily rate limited|retrying the same application step/.test(currentWaitingReason)) {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 60_000))
    } else await new Promise(resolveDelay => setTimeout(resolveDelay, 3_000))
  }
  const finalRun = await ownRun(session, keys, runId)
  record.final = runStateSummary(finalRun || run)
  if (Date.now() >= deadline && !['completed', 'cancelled'].includes(record.final.status)) {
    record.blockers.push({ kind: 'qualification_timeout', maxMinutes })
    mark('timeout', { status: record.final.status })
  }
  record.evidence = await collectEvidence(session, keys, runId, task.taskId)
  record.finishedAt = new Date().toISOString()
  mark('finished', { status: record.final.status, cases: record.evidence.metrics.caseCount, modelResponses: record.evidence.metrics.modelResponseCount })
  return record
}

function costEstimate(usage) {
  const input = Number(usage?.input_tokens || 0)
  const cached = Number(usage?.input_tokens_details?.cached_tokens || 0)
  const output = Number(usage?.output_tokens || 0)
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    estimatedUsd: (Math.max(0, input - cached) * 0.2 + cached * 0.02 + output * 1.2) / 1_000_000,
  }
}

async function main() {
  const keys = loadApiKeys()
  const session = await authenticateConnectedUser(keys)
  console.log(`[qualification] authenticated production user ${shortId(session.userId)} with ${session.scopesCount ?? 0} Google scopes`)
  const runs = []
  if (resumeRunId) {
    const existingRun = await ownRun(session, keys, resumeRunId)
    if (!existingRun) throw new Error('The requested production AgentRun could not be loaded for resume.')
    const task = { taskId: existingRun.task_id, title: NATURAL_REQUEST, description: '', dueDate: null, assetEvidence: [], profileSeeded: false }
    console.log(`[qualification] resuming existing run ${shortId(resumeRunId)} for task ${shortId(task.taskId)}`)
    runs.push(await executeRun(session, keys, task, 1, existingRun))
  } else {
    for (let runNumber = 1; runNumber <= requestedRuns; runNumber += 1) {
      const task = await seedTaskAndDocuments(session, keys, runNumber)
      console.log(`[qualification run ${runNumber}] seeded task ${shortId(task.taskId)} with ${task.assetEvidence.length} source documents`)
      runs.push(await executeRun(session, keys, task, runNumber))
      if (runNumber < requestedRuns) await new Promise(resolveDelay => setTimeout(resolveDelay, 5_000))
    }
  }
  const aggregateUsage = {}
  for (const run of runs) {
    const usage = run.evidence?.usage || {}
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value === 'number') aggregateUsage[key] = (aggregateUsage[key] || 0) + value
      if (value && typeof value === 'object') {
        aggregateUsage[key] = aggregateUsage[key] || {}
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (typeof nestedValue === 'number') aggregateUsage[key][nestedKey] = (aggregateUsage[key][nestedKey] || 0) + nestedValue
        }
      }
    }
  }
  const report = {
    suiteVersion: 'david_application_engine_v3_production_qualification',
    qualificationStartedAt,
    generatedAt: new Date().toISOString(),
    implementationCommit: IMPLEMENTATION_COMMIT,
    evidenceCommit: EVIDENCE_COMMIT,
    production: {
      supabaseProjectRef: PROJECT_REF,
      supabaseFunctionsEndpoint: `${SUPABASE_URL}/functions/v1/task-agent`,
      frontendAlias: APP_URL,
      model: MODEL,
      reasoningEffort: 'low',
      harnessVersion: 'david-application-controller@2.1',
      promptVersion: 'david-prompt@6',
      primitiveVersion: 'public-browser@1',
      authenticatedUserId: session.userId,
      googleScopesCount: session.scopesCount,
      accountEmailDomain: session.accountEmail?.split('@').at(-1) || null,
    },
    request: NATURAL_REQUEST,
    requestedRuns: resumeRunId ? 1 : requestedRuns,
    maxMinutesPerRun: maxMinutes,
    runs,
    aggregate: {
      finalStatuses: runs.map(run => run.final?.status || 'unknown'),
      consecutiveCompletedRuns: (() => {
        let count = 0
        for (const run of runs) {
          if (run.final?.status === 'completed' && (run.evidence?.metrics?.failureEventCount || 0) === 0) count += 1
          else break
        }
        return count
      })(),
      totalApplications: runs.reduce((sum, run) => sum + (run.evidence?.metrics?.caseCount || 0), 0),
      totalModelResponses: runs.reduce((sum, run) => sum + (run.evidence?.metrics?.modelResponseCount || 0), 0),
      usage: aggregateUsage,
      cost: costEstimate(aggregateUsage),
    },
  }
  const path = outputPath || resolve('benchmarks/david-applications/results', `production-qualification-${Date.now()}.json`)
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`[qualification] report written to ${path}`)
  console.log(JSON.stringify({ statuses: report.aggregate.finalStatuses, applications: report.aggregate.totalApplications, consecutiveCompletedRuns: report.aggregate.consecutiveCompletedRuns, report: path }, null, 2))
}

main().catch(error => {
  console.error(`[qualification] fatal: ${safeError(error)}`)
  process.exitCode = 1
})
