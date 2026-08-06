import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { executeGoogleTool, GoogleIntegrationError } from '../_shared/google.ts'
import { classifyApplicationReply, matchApplicationOtp, nextApplicationCaseState, type OtpMessage, type OtpRequest } from '../_shared/david-applications.ts'
import { applicationFailureIsRetryable, applicationFollowUpAllowed, applicationMessageQuery, applicationWriteIsApproved, isGenericProfessorOutreach, safeApplicationRequestKind } from '../_shared/application-roon.ts'
import { persistedEmailArguments } from '../_shared/email-integrity.ts'

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: noStoreHeaders })
}

function secureStringEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function safeString(value: unknown, maximum = 2_000) {
  return typeof value === 'string' ? value.slice(0, maximum) : ''
}

function gmailSearchTerm(value: unknown, maximum = 120) {
  return safeString(value, maximum).replace(/[^a-zA-Z0-9@._+\- ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function redactApplicationExcerpt(value: unknown) {
  return safeString(value, 2_000)
    .replace(/\b(?:password|passcode|secret|security key)\s*[:=]\s*[^\s,;.]+/gi, '[redacted credential]')
    .replace(/\b(?:verification code|one[- ]time password|otp|code)\s*[:=]?\s*\d{4,8}\b/gi, '[redacted verification code]')
    .replace(/\b\d{4,8}\b/g, '[redacted number]')
    .trim()
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

type ApplicationRequestRow = {
  id: string
  user_id: string
  task_id: string
  agent_run_id: string
  created_at?: string
  updated_at?: string
  application_case_id: string
  from_specialist_id?: string
  to_specialist_id?: string
  request_kind: string
  payload: Record<string, unknown> | null
  status: string
  result: Record<string, unknown> | null
  human_assignment_id?: string | null
  attempt_count?: number
}

type ApplicationRequestContext = {
  request: ApplicationRequestRow
  run: Record<string, unknown>
  applicationCase: Record<string, unknown>
  campaign: Record<string, unknown>
  assignment: Record<string, unknown> | null
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArray(value: unknown, maximum = 120) {
  return Array.isArray(value) ? value.map(item => safeString(item, maximum)).filter(Boolean) : []
}

function normalizeEmail(value: unknown) {
  const candidate = safeString(value, 320).trim().toLocaleLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function bytesFromBase64(value: unknown) {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/') : ''
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null
  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

function safeApplicationFilename(value: unknown, fallback = 'writer-draft') {
  const filename = safeString(value, 180).replace(/[^a-zA-Z0-9._ -]/g, '_').trim()
  return filename || fallback
}

const applicationAttachmentMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
])

async function loadApplicationRequestContext(admin: AdminClient, request: ApplicationRequestRow): Promise<ApplicationRequestContext> {
  if (request.from_specialist_id && request.from_specialist_id !== 'david') throw new Error('Only David may queue application work for Roon.')
  if (request.to_specialist_id && request.to_specialist_id !== 'roon') throw new Error('This application request is not addressed to Roon.')
  const [runResult, caseResult] = await Promise.all([
    admin.from('agent_runs').select('*').eq('id', request.agent_run_id).eq('user_id', request.user_id).maybeSingle(),
    admin.from('application_cases').select('*').eq('id', request.application_case_id).eq('user_id', request.user_id).maybeSingle(),
  ])
  if (runResult.error || caseResult.error) throw new Error(runResult.error?.message ?? caseResult.error?.message ?? 'Application handoff ownership could not be verified.')
  if (!runResult.data || !caseResult.data || safeString(caseResult.data.task_id, 120) !== request.task_id || safeString(runResult.data.task_id, 120) !== request.task_id) {
    throw new Error('Application handoff ownership could not be verified.')
  }
  const campaignResult = await admin.from('application_campaigns').select('*').eq('id', caseResult.data.campaign_id).eq('user_id', request.user_id).eq('task_id', request.task_id).maybeSingle()
  if (campaignResult.error || !campaignResult.data) throw new Error(campaignResult.error?.message ?? 'The application campaign is unavailable for this handoff.')
  const payload = recordValue(request.payload)
  const assignmentId = safeString(request.human_assignment_id ?? payload.human_assignment_id ?? payload.humanAssignmentId, 80)
  let assignment: Record<string, unknown> | null = null
  if (assignmentId) {
    const assignmentResult = await admin.from('human_assignments').select('*').eq('id', assignmentId).eq('user_id', request.user_id).eq('application_case_id', request.application_case_id).maybeSingle()
    if (assignmentResult.error || !assignmentResult.data) throw new Error(assignmentResult.error?.message ?? 'The human assignment is not attached to this application case.')
    assignment = assignmentResult.data as Record<string, unknown>
  }
  return { request, run: runResult.data as Record<string, unknown>, applicationCase: caseResult.data as Record<string, unknown>, campaign: campaignResult.data as Record<string, unknown>, assignment }
}

async function claimApplicationRequest(admin: AdminClient, request: ApplicationRequestRow) {
  const claimed = await admin.from('application_inter_agent_requests')
    .update({ status: 'running', attempt_count: Number(request.attempt_count ?? 0) + 1, last_error: null })
    .eq('id', request.id)
    .eq('status', 'queued')
    .select('id,user_id,task_id,agent_run_id,application_case_id,from_specialist_id,to_specialist_id,request_kind,payload,status,result,human_assignment_id,attempt_count')
    .maybeSingle()
  if (claimed.error) throw new Error(claimed.error.message)
  return claimed.data as ApplicationRequestRow | null
}

async function updateApplicationRequest(admin: AdminClient, requestId: string, status: string, result: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const updated = await admin.from('application_inter_agent_requests').update({ status, result, ...extra }).eq('id', requestId).eq('status', 'running').select('id,status').maybeSingle()
  if (updated.error) throw new Error(updated.error.message)
  return updated.data
}

async function recordApplicationWorkerEvent(admin: AdminClient, context: ApplicationRequestContext, eventType: string, status: string, message: string, metadata: Record<string, unknown>) {
  const result = await admin.from('agent_run_events').insert({
    run_id: context.request.agent_run_id,
    user_id: context.request.user_id,
    event_type: eventType,
    status,
    message: message.slice(0, 2_000),
    metadata: { ...metadata, application_case_id: context.request.application_case_id, request_id: context.request.id, specialist_id: 'roon' },
  })
  if (result.error) throw new Error(result.error.message)
}

async function persistApplicationAction(
  admin: AdminClient,
  context: ApplicationRequestContext,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  output: Record<string, unknown>,
  idempotencyKey: string,
  providerActionId: string,
  summary: string,
) {
  const safeArguments = persistedEmailArguments(toolName, argumentsValue, output)
  const action = await admin.from('agent_actions').upsert({
    run_id: context.request.agent_run_id,
    user_id: context.request.user_id,
    step_index: Number(context.run.current_step ?? 0),
    tool_name: toolName,
    model_call_id: null,
    risk: ['gmail.send_message', 'calendar.create_event', 'calendar.update_event', 'calendar.delete_event'].includes(toolName) ? 'external_write' : 'prepare',
    status: 'succeeded',
    arguments: safeArguments,
    output,
    public_summary: summary,
    idempotency_key: idempotencyKey,
    provider_action_id: providerActionId || null,
    retryable: false,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,tool_name,idempotency_key' }).select('id').single()
  if (action.error || !action.data) throw new Error(action.error?.message ?? 'The Roon provider action could not be recorded.')
  return action.data.id as string
}

async function persistApplicationCommunication(
  admin: AdminClient,
  context: ApplicationRequestContext,
  input: {
    contactId?: string | null
    direction: 'inbound' | 'outbound'
    providerMessageId?: string | null
    providerThreadId?: string | null
    classification?: string | null
    subject?: string
    excerpt?: string
    idempotencyKey: string
    humanAssignmentId?: string | null
    data?: Record<string, unknown>
  },
) {
  const caseData = recordValue(context.applicationCase.data)
  const communication = await admin.from('application_communications').upsert({
    user_id: context.request.user_id,
    application_case_id: context.request.application_case_id,
    task_id: context.request.task_id,
    campaign_id: context.campaign.id,
    agent_run_id: context.request.agent_run_id,
    human_assignment_id: input.humanAssignmentId ?? context.assignment?.id ?? null,
    contact_id: input.contactId ?? null,
    provider: 'gmail',
    provider_message_id: input.providerMessageId ?? null,
    provider_thread_id: input.providerThreadId ?? null,
    direction: input.direction,
    classification: input.classification ?? null,
    data: { ...(input.data ?? {}), subject: safeString(input.subject, 998), excerpt: safeString(input.excerpt, 2_000) },
    idempotency_key: input.idempotencyKey,
  }, { onConflict: 'user_id,application_case_id,idempotency_key' }).select('id').single()
  if (communication.error || !communication.data) throw new Error(communication.error?.message ?? 'The application communication could not be persisted.')
  const communicationIds = stringArray(caseData.communicationIds)
  if (!communicationIds.includes(communication.data.id)) communicationIds.push(communication.data.id)
  const updatedCase = await admin.from('application_cases').update({ data: { ...caseData, communicationIds } }).eq('id', context.request.application_case_id).eq('user_id', context.request.user_id)
  if (updatedCase.error) throw new Error(updatedCase.error.message)
  return communication.data.id as string
}

async function persistApplicationEvidence(
  admin: AdminClient,
  context: ApplicationRequestContext,
  input: {
    kind: string
    providerMessageId?: string | null
    providerThreadId?: string | null
    excerpt?: string
    metadata?: Record<string, unknown>
    idempotencyKey: string
    assetId?: string | null
  },
) {
  const evidence = await admin.from('application_evidence').upsert({
    user_id: context.request.user_id,
    application_case_id: context.request.application_case_id,
    task_id: context.request.task_id,
    campaign_id: context.campaign.id,
    agent_run_id: context.request.agent_run_id,
    human_assignment_id: context.assignment?.id ?? null,
    kind: input.kind,
    provider: 'gmail',
    provider_message_id: input.providerMessageId ?? null,
    provider_thread_id: input.providerThreadId ?? null,
    asset_id: input.assetId ?? null,
    excerpt: safeString(input.excerpt, 2_000) || null,
    metadata: input.metadata ?? {},
    idempotency_key: input.idempotencyKey,
  }, { onConflict: 'user_id,application_case_id,idempotency_key' }).select('id').single()
  if (evidence.error || !evidence.data) throw new Error(evidence.error?.message ?? 'Application execution evidence could not be persisted.')
  return evidence.data.id as string
}

async function persistApplicationReplyAttachments(
  admin: AdminClient,
  context: ApplicationRequestContext,
  message: Record<string, unknown>,
  attachmentValues: unknown,
  options: { contactKind: string },
) {
  const assignment = context.assignment
  const values = Array.isArray(attachmentValues) ? attachmentValues.slice(0, 8) : []
  const artifactIds: string[] = []
  const assetIds: string[] = []
  const contactKind = options.contactKind.toLocaleLowerCase()
  const artifactKind = contactKind === 'referee' ? 'reference_letter' : contactKind === 'editor' ? 'edited_version' : contactKind === 'writer' ? 'writer_draft' : 'immutable_original'
  const authorType = contactKind === 'referee' ? 'referee' : contactKind === 'editor' ? 'editor' : contactKind === 'writer' ? 'writer' : 'institution'
  const source = contactKind === 'writer' || contactKind === 'editor' ? 'roon_writer_reply' : 'institution_reply'
  const sourceAssetIds = assignment ? stringArray(assignment.source_material_ids) : []
  const previousArtifacts = assignment
    ? await admin.from('application_artifacts').select('id,checksum,revision_history,metadata').eq('user_id', context.request.user_id).eq('application_case_id', context.request.application_case_id).order('created_at', { ascending: false }).limit(30)
    : { data: [], error: null }
  if (previousArtifacts.error) throw new Error(previousArtifacts.error.message)
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const attachment = value as Record<string, unknown>
    const bytes = bytesFromBase64(attachment.base64)
    const mimeType = safeString(attachment.mime_type ?? attachment.mimeType, 160).toLocaleLowerCase() || 'application/octet-stream'
    if (!bytes?.length || bytes.length > 10 * 1024 * 1024 || !applicationAttachmentMimeTypes.has(mimeType)) {
      throw new Error('An application reply contained an unsupported or oversized attachment.')
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const existing = await admin.from('file_assets').select('id').eq('user_id', context.request.user_id).eq('task_id', context.request.task_id).eq('application_case_id', context.request.application_case_id).eq('checksum', checksum).maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    let assetId = safeString(existing.data?.id, 80)
    if (!assetId) {
      assetId = crypto.randomUUID()
      const filename = safeApplicationFilename(attachment.name, 'writer-draft')
      const storageKey = `${context.request.user_id}/${assetId}/${filename}`
      const uploaded = await admin.storage.from('private-file-assets').upload(storageKey, bytes, { contentType: mimeType, upsert: false })
      if (uploaded.error) throw new Error(uploaded.error.message)
      const inserted = await admin.from('file_assets').insert({
        id: assetId,
        user_id: context.request.user_id,
        task_id: context.request.task_id,
        agent_run_id: context.request.agent_run_id,
        original_filename: filename,
        mime_type: mimeType,
        storage_key: storageKey,
        size_bytes: bytes.length,
        checksum,
        source,
        reusable: false,
        original_asset_id: null,
        asset_kind: artifactKind,
        application_case_id: context.request.application_case_id,
        opportunity_id: safeString(context.applicationCase.opportunity_id, 80) || null,
        source_asset_ids: sourceAssetIds,
        template_version: null,
        prompt_version: null,
        author_type: authorType,
        approval_status: 'pending',
        revision_history: [],
        final_submission_destination: null,
      }).select('id').single()
      if (inserted.error || !inserted.data) {
        await admin.storage.from('private-file-assets').remove([storageKey])
        throw new Error(inserted.error?.message ?? 'The application reply file could not be persisted.')
      }
    }
    assetIds.push(assetId)
    const prior = assignment
      ? (previousArtifacts.data ?? []).find(item => {
          const metadata = recordValue(item.metadata)
          return safeString(metadata.assignment_id, 80) === safeString(assignment.id, 80) && safeString(item.checksum, 80) !== checksum
        })
      : null
    const priorHistory = prior && Array.isArray(prior.revision_history) ? prior.revision_history.map(value => safeString(value, 80)).filter(Boolean) : []
    const revisionHistory = prior ? [...priorHistory, String(prior.id)].slice(-20) : []
    const artifact = await admin.from('application_artifacts').upsert({
      user_id: context.request.user_id,
      file_asset_id: assetId,
      application_case_id: context.request.application_case_id,
      opportunity_id: safeString(context.applicationCase.opportunity_id, 80) || null,
      kind: artifactKind,
      original_asset_ids: sourceAssetIds,
      author_type: authorType,
      revision_of: prior?.id ?? null,
      revision_history: revisionHistory,
      checksum,
      approval_status: 'pending',
      metadata: {
        ...(assignment ? { assignment_id: assignment.id } : {}),
        artifact_role: artifactKind === 'reference_letter' ? 'received_reference_letter' : 'application_reply_attachment',
        provider_message_id: safeString(message.id, 256),
        provider_thread_id: safeString(message.thread_id ?? message.threadId, 256),
        received_at: safeString(message.date, 80),
        attachment_name: safeApplicationFilename(attachment.name),
        quality_checks: { non_empty: true, bounded_size: true, supported_mime: true, checksum_verified: true },
      },
    }, { onConflict: 'user_id,file_asset_id' }).select('id').single()
    if (artifact.error || !artifact.data) throw new Error(artifact.error?.message ?? 'The application reply artifact could not be persisted.')
    if (prior) {
      const superseded = await admin.from('application_artifacts').update({ approval_status: 'superseded' }).eq('id', prior.id).eq('user_id', context.request.user_id)
      if (superseded.error) throw new Error(superseded.error.message)
    }
    artifactIds.push(String(artifact.data.id))
  }
  return { artifactIds, assetIds }
}

async function updateApplicationContact(admin: AdminClient, context: ApplicationRequestContext, contactId: string, threadId: string | null, messageId: string | null) {
  if (!contactId) return
  const updated = await admin.from('application_contacts').update({ gmail_thread_id: threadId, last_provider_message_id: messageId }).eq('id', contactId).eq('user_id', context.request.user_id).eq('application_case_id', context.request.application_case_id)
  if (updated.error) throw new Error(updated.error.message)
}

async function releaseWriterLoad(admin: AdminClient, context: ApplicationRequestContext, writerId: string) {
  if (!writerId) return
  const writer = await admin.from('application_writers').select('active_assignments').eq('id', writerId).eq('user_id', context.request.user_id).maybeSingle()
  if (writer.error && writer.error.code !== '42P01') throw new Error(writer.error.message)
  if (!writer.data) return
  const updated = await admin.from('application_writers').update({ active_assignments: Math.max(0, Number(writer.data.active_assignments ?? 0) - 1) }).eq('id', writerId).eq('user_id', context.request.user_id)
  if (updated.error) throw new Error(updated.error.message)
}

async function materializeApplicationAttachments(admin: AdminClient, context: ApplicationRequestContext, assetIds: string[]) {
  const ids = [...new Set(assetIds.filter(Boolean))]
  if (!ids.length) return []
  if (ids.length > 8) throw new Error('A writer or referee message may include at most eight source files.')
  const assets = await admin.from('file_assets').select('id,original_filename,mime_type,storage_key,size_bytes,checksum,task_id,application_case_id,reusable').eq('user_id', context.request.user_id).in('id', ids)
  if (assets.error) throw new Error(assets.error.message)
  const byId = new Map((assets.data ?? []).map(asset => [String(asset.id), asset]))
  const attachments: Array<Record<string, unknown>> = []
  let totalBytes = 0
  for (const id of ids) {
    const asset = byId.get(id)
    const assetCaseId = safeString(asset?.application_case_id, 80)
    const ownedByCase = Boolean(asset && assetCaseId && assetCaseId === context.request.application_case_id)
    const ownedByTask = Boolean(asset && !assetCaseId && (safeString(asset.task_id, 80) === context.request.task_id || asset.reusable === true))
    if (!asset || (!ownedByCase && !ownedByTask)) {
      throw new Error('A requested attachment is not owned by this application task.')
    }
    if (Number(asset.size_bytes) > 10 * 1024 * 1024) throw new Error('An application attachment is larger than the safe email limit.')
    const downloaded = await admin.storage.from('private-file-assets').download(String(asset.storage_key))
    if (downloaded.error || !downloaded.data) throw new Error('A requested application attachment could not be read from private storage.')
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
    totalBytes += bytes.length
    if (totalBytes > 18 * 1024 * 1024) throw new Error('The application email attachments exceed the bounded Gmail size limit.')
    attachments.push({ name: safeString(asset.original_filename, 160), mime_type: safeString(asset.mime_type, 160) || 'application/octet-stream', base64: base64FromBytes(bytes), asset_id: id, checksum: safeString(asset.checksum, 128) })
  }
  return attachments
}

function messageDateAfter(value: unknown, requestedAt: string) {
  const received = Date.parse(safeString(value, 240))
  const requested = Date.parse(requestedAt)
  return Number.isFinite(received) && Number.isFinite(requested) && received >= requested
}

function messageFromUser(value: unknown, accountEmail: string) {
  return normalizeEmail(value).toLocaleLowerCase() === normalizeEmail(accountEmail).toLocaleLowerCase()
}

async function resolveApplicationContact(admin: AdminClient, context: ApplicationRequestContext, payload: Record<string, unknown>) {
  const recipient = safeString(payload.recipient ?? payload.email ?? payload.name, 320)
  if (!recipient) throw new Error('A recipient name or email is required.')
  const result = await executeGoogleTool(admin, context.request.user_id, 'contacts.resolve_recipient', { recipient }, `application-roon-contact:${context.request.id}`)
  const value = result.value
  if (value.state === 'ambiguous' || value.state === 'not_found') return { result, waiting: true }
  const email = normalizeEmail(value.email)
  if (!email) throw new Error('Google returned no verified contact address.')
  const candidates = Array.isArray(value.candidates) ? value.candidates : []
  const candidate = candidates[0] && typeof candidates[0] === 'object' ? candidates[0] as Record<string, unknown> : {}
  const kind = ['professor', 'admissions', 'referee', 'writer', 'editor', 'administrator'].includes(String(payload.contact_kind)) ? String(payload.contact_kind) : 'administrator'
  const contact = await admin.from('application_contacts').upsert({
    user_id: context.request.user_id,
    application_case_id: context.request.application_case_id,
    task_id: context.request.task_id,
    campaign_id: context.campaign.id,
    agent_run_id: context.request.agent_run_id,
    kind,
    name: safeString(payload.name, 240) || safeString(value.recipient, 240) || email,
    email,
    provider_contact_id: safeString(candidate.resource_name ?? candidate.provider_contact_id, 256) || null,
    consent_to_contact: payload.consent_to_contact === true,
    data: { resolution_evidence: safeString(value.evidence, 120) },
    idempotency_key: safeString(payload.contact_idempotency_key ?? context.request.id, 300),
  }, { onConflict: 'user_id,idempotency_key' }).select('id,email,name').single()
  if (contact.error || !contact.data) throw new Error(contact.error?.message ?? 'The application contact could not be persisted.')
  return { result, waiting: false, contact: contact.data }
}

async function processApplicationEmailRequest(admin: AdminClient, context: ApplicationRequestContext) {
  const request = context.request
  const payload = recordValue(request.payload)
  const requestKind = safeApplicationRequestKind(request.request_kind)
  if (!requestKind || !['create_draft', 'send_email', 'follow_up'].includes(requestKind)) throw new Error('Unsupported application email request.')
  if (JSON.stringify(payload).match(/"(?:password|passcode|secret|card_number|cvv|cvc|bank_account|verification_code|otp|security_key)"\s*:/i)) throw new Error('Application email payload contains a sensitive value.')
  if (requestKind === 'follow_up' && !applicationFollowUpAllowed(payload)) {
    await recordApplicationWorkerEvent(admin, context, 'application_follow_up_stopped', 'succeeded', 'Roon stopped the follow-up cadence because the contact or application is no longer eligible for another message.', {})
    return { status: 'completed', result: { kind: 'follow_up', stopped: true, reason: 'follow_up_limit_or_contact_state' } }
  }
  if (isGenericProfessorOutreach(payload)) throw new Error('Professor outreach needs evidence from the professor’s official work and a matching personalised passage.')
  const payloadTo = Array.isArray(payload.to) ? payload.to.map(normalizeEmail).filter(Boolean) : [normalizeEmail(payload.to)].filter(Boolean)
  let contactId = safeString(payload.contact_id ?? payload.contactId, 80) || null
  let to = payloadTo
  if (!to.length) {
    const resolved = await resolveApplicationContact(admin, context, payload)
    if (resolved.waiting) return { status: 'waiting_user', result: { kind: 'resolve_contact', resolution: resolved.result.value } }
    to = [normalizeEmail((resolved.contact as Record<string, unknown>).email)]
    contactId = safeString((resolved.contact as Record<string, unknown>).id, 80) || null
  }
  if (!to.length || to.length > 50) throw new Error('The application email needs one or more verified recipients.')
  if (!contactId) {
    if (to.length !== 1) throw new Error('Each application recipient must be resolved to a case contact before sending.')
    const resolved = await resolveApplicationContact(admin, context, {
      ...payload,
      recipient: to[0],
      email: to[0],
      contact_kind: payload.contact_kind ?? payload.contactKind ?? 'administrator',
    })
    if (resolved.waiting) return { status: 'waiting_user', result: { kind: 'resolve_contact', resolution: resolved.result.value } }
    const resolvedContact = resolved.contact as Record<string, unknown>
    const resolvedEmail = normalizeEmail(resolvedContact.email)
    if (!resolvedEmail || resolvedEmail !== to[0]) throw new Error('The application recipient did not match the resolved case contact.')
    contactId = safeString(resolvedContact.id, 80) || null
  }
  const subject = safeString(payload.subject, 998)
  const bodyText = safeString(payload.body_text ?? payload.body, 30_000)
  if (!subject || !bodyText) throw new Error('The application email needs a subject and body.')
  const threadId = safeString(payload.thread_id ?? payload.threadId, 256) || safeString(context.assignment?.gmail_thread_id, 256) || null
  const inReplyTo = safeString(payload.in_reply_to_message_id ?? payload.inReplyToMessageId, 256) || safeString(context.assignment?.last_provider_message_id, 256) || null
  if (Boolean(threadId) !== Boolean(inReplyTo)) throw new Error('A threaded application reply must include both the Gmail thread and the message it answers.')
  if (requestKind === 'follow_up' && !threadId) throw new Error('Follow-ups must stay on the existing Gmail thread.')
  const sendRequested = requestKind !== 'create_draft' && payload.send_mode !== 'draft' && payload.sendMode !== 'draft'
  if (sendRequested && contactId) {
    const contact = await admin.from('application_contacts').select('id,kind,email,consent_to_contact').eq('id', contactId).eq('user_id', context.request.user_id).eq('application_case_id', context.request.application_case_id).maybeSingle()
    if (contact.error) throw new Error(contact.error.message)
    if (!contact.data || !normalizeEmail(contact.data.email) || !to.includes(normalizeEmail(contact.data.email))) throw new Error('The application recipient does not match the verified case contact.')
    if (contact.data.consent_to_contact !== true && payload.consent_to_contact !== true && payload.consentToContact !== true) {
      await recordApplicationWorkerEvent(admin, context, 'application_contact_approval_needed', 'waiting_user', 'Roon resolved the recipient but is waiting for approval before first contact.', { contact_id: contactId, contact_kind: contact.data.kind })
      return { status: 'waiting_user', result: { kind: 'contact_approval_required', contact_id: contactId, recipient: to[0] } }
    }
    if (contact.data.consent_to_contact !== true && (payload.consent_to_contact === true || payload.consentToContact === true)) {
      const consented = await admin.from('application_contacts').update({ consent_to_contact: true }).eq('id', contactId).eq('user_id', context.request.user_id).eq('application_case_id', context.request.application_case_id)
      if (consented.error) throw new Error(consented.error.message)
    }
  }
  const assignmentId = safeString(payload.human_assignment_id ?? payload.humanAssignmentId, 80) || safeString(context.assignment?.id, 80)
  const providedDraftId = safeString(payload.draft_id ?? payload.draftId, 256)
  const assetIds = stringArray(payload.attachment_asset_ids ?? payload.attachmentAssetIds)
  const attachments = providedDraftId ? [] : await materializeApplicationAttachments(admin, context, assetIds)
  const draftArguments: Record<string, unknown> = {
    to,
    cc: Array.isArray(payload.cc) ? payload.cc.map(normalizeEmail).filter(Boolean) : [],
    bcc: Array.isArray(payload.bcc) ? payload.bcc.map(normalizeEmail).filter(Boolean) : [],
    subject,
    body_text: bodyText,
    thread_id: threadId,
    in_reply_to_message_id: inReplyTo,
    ...(attachments.length ? { attachments } : {}),
  }
  let draft: Record<string, unknown>
  let draftActionId = ''
  if (providedDraftId) {
    const existingDraftAction = await admin.from('agent_actions')
      .select('id,output')
      .eq('run_id', context.request.agent_run_id)
      .eq('user_id', context.request.user_id)
      .eq('tool_name', 'gmail.create_draft')
      .eq('status', 'succeeded')
      .eq('output->>draft_id', providedDraftId)
      .maybeSingle()
    if (existingDraftAction.error) throw new Error(existingDraftAction.error.message)
    if (!existingDraftAction.data) throw new Error('The requested Gmail draft was not prepared by this application task.')
    draft = recordValue(existingDraftAction.data.output)
    draftActionId = safeString(existingDraftAction.data.id, 80)
  } else {
    const draftResult = await executeGoogleTool(admin, context.request.user_id, 'gmail.create_draft', draftArguments, `application-roon-draft:${request.id}`)
    draft = recordValue(draftResult.value)
    draftActionId = await persistApplicationAction(admin, context, 'gmail.create_draft', draftArguments, draft, `application-roon-draft:${request.id}`, safeString(draftResult.providerActionId, 256), 'Roon prepared the application email draft.')
  }
  await persistApplicationCommunication(admin, context, {
    contactId,
    direction: 'outbound',
    providerMessageId: safeString(draft.message_id, 256) || null,
    providerThreadId: safeString(draft.thread_id, 256) || threadId,
    subject,
    excerpt: redactApplicationExcerpt(bodyText),
    idempotencyKey: `application-draft:${request.id}`,
    humanAssignmentId: assignmentId || null,
    data: { status: 'draft', draft_id: safeString(draft.draft_id, 256), asset_ids: assetIds, action_id: draftActionId, reused: Boolean(providedDraftId) },
  })
  if (!sendRequested) {
    return { status: 'completed', result: { kind: 'email_draft', draft_id: safeString(draft.draft_id, 256), message_id: safeString(draft.message_id, 256), thread_id: safeString(draft.thread_id, 256) || threadId, attachment_count: Array.isArray(draft.attachments) ? draft.attachments.length : attachments.length, reused: Boolean(providedDraftId) } }
  }
  if (!applicationWriteIsApproved(payload)) {
    await recordApplicationWorkerEvent(admin, context, 'application_email_approval_needed', 'waiting_user', 'Roon prepared the exact application email and is waiting for the approved send instruction.', { draft_id: safeString(draft.draft_id, 256), contact_id: contactId })
    return { status: 'waiting_user', result: { kind: 'email_send_approval_required', draft_id: safeString(draft.draft_id, 256), message_id: safeString(draft.message_id, 256), thread_id: safeString(draft.thread_id, 256) || threadId, attachment_count: Array.isArray(draft.attachments) ? draft.attachments.length : attachments.length } }
  }
  const sendArguments: Record<string, unknown> = {
    draft_id: safeString(draft.draft_id, 256),
    expected_to: to,
    expected_cc: draftArguments.cc,
    expected_bcc: draftArguments.bcc,
    expected_subject: subject,
  }
  const sentResult = await executeGoogleTool(admin, context.request.user_id, 'gmail.send_message', sendArguments, `application-roon-send:${request.id}`)
  const sent = sentResult.value
  const sendActionId = await persistApplicationAction(admin, context, 'gmail.send_message', sendArguments, sent, `application-roon-send:${request.id}`, safeString(sentResult.providerActionId, 256), 'Gmail confirmed the application email was sent.')
  const sentMessageId = safeString(sent.message_id, 256) || null
  const sentThreadId = safeString(sent.thread_id, 256) || threadId
  await persistApplicationCommunication(admin, context, {
    contactId,
    direction: 'outbound',
    providerMessageId: sentMessageId,
    providerThreadId: sentThreadId,
    subject,
    excerpt: redactApplicationExcerpt(bodyText),
    idempotencyKey: `application-sent:${request.id}`,
    humanAssignmentId: assignmentId || null,
    data: { status: 'sent', draft_id: safeString(draft.draft_id, 256), action_id: sendActionId, sent_at: new Date().toISOString() },
  })
  await persistApplicationEvidence(admin, context, {
    kind: 'sent_message',
    providerMessageId: sentMessageId,
    providerThreadId: sentThreadId,
    excerpt: `Gmail confirmed the application message to ${to.join(', ')}.`,
    metadata: { subject, sent_at: new Date().toISOString(), request_kind: requestKind, draft_id: safeString(draft.draft_id, 256) },
    idempotencyKey: `application-sent-evidence:${request.id}`,
  })
  await updateApplicationContact(admin, context, contactId ?? '', sentThreadId, sentMessageId)
  if (assignmentId) {
    const assignmentUpdate = await admin.from('human_assignments').update({ status: 'assigned', gmail_thread_id: sentThreadId, last_provider_message_id: sentMessageId }).eq('id', assignmentId).eq('user_id', context.request.user_id).eq('application_case_id', context.request.application_case_id)
    if (assignmentUpdate.error) throw new Error(assignmentUpdate.error.message)
  }
  await recordApplicationWorkerEvent(admin, context, 'application_email_sent', 'succeeded', 'Roon sent the approved application message and attached the provider result to the case.', { message_id: sentMessageId, thread_id: sentThreadId, contact_id: contactId, assignment_id: assignmentId || null })
  return { status: 'completed', result: { kind: 'email_sent', message_id: sentMessageId, thread_id: sentThreadId, draft_id: safeString(draft.draft_id, 256), recipient_count: to.length, attachment_count: attachments.length } }
}

async function processApplicationContactRequest(admin: AdminClient, context: ApplicationRequestContext) {
  const payload = recordValue(context.request.payload)
  const resolved = await resolveApplicationContact(admin, context, payload)
  if (resolved.waiting) return { status: 'waiting_user', result: { kind: 'resolve_contact', resolution: resolved.result.value } }
  const value = resolved.result.value
  await recordApplicationWorkerEvent(admin, context, 'application_contact_resolved', 'succeeded', 'Roon resolved the application contact through Google Contacts or prior Gmail headers.', { contact_id: (resolved.contact as Record<string, unknown>).id, evidence: value.evidence ?? null })
  return { status: 'completed', result: { kind: 'contact_resolved', contact_id: (resolved.contact as Record<string, unknown>).id, email: (resolved.contact as Record<string, unknown>).email, name: (resolved.contact as Record<string, unknown>).name, evidence: value.evidence ?? null } }
}

async function processApplicationCalendarRequest(admin: AdminClient, context: ApplicationRequestContext) {
  const payload = recordValue(context.request.payload)
  if (!applicationWriteIsApproved(payload)) return { status: 'waiting_user', result: { kind: 'calendar_approval_required', summary: safeString(payload.summary, 1_000), start: safeString(payload.start, 80), end: safeString(payload.end, 80) } }
  const calendarArguments: Record<string, unknown> = {
    calendar_id: safeString(payload.calendar_id ?? payload.calendarId, 320) || 'primary',
    summary: safeString(payload.summary, 1_000),
    description: safeString(payload.description, 12_000),
    start: safeString(payload.start, 80),
    end: safeString(payload.end, 80),
    timezone: safeString(payload.timezone, 120) || 'UTC',
    attendee_emails: Array.isArray(payload.attendee_emails) ? payload.attendee_emails.map(normalizeEmail).filter(Boolean) : [],
    add_google_meet: payload.add_google_meet === true,
    notify_attendees: payload.notify_attendees !== false,
  }
  if (!calendarArguments.summary || !calendarArguments.start || !calendarArguments.end) throw new Error('The application meeting needs a title, start, and end time.')
  const calendarResult = await executeGoogleTool(admin, context.request.user_id, 'calendar.create_event', calendarArguments, `application-roon-calendar:${context.request.id}`)
  const event = calendarResult.value
  await persistApplicationAction(admin, context, 'calendar.create_event', calendarArguments, event, `application-roon-calendar:${context.request.id}`, safeString(calendarResult.providerActionId, 256), 'Google Calendar confirmed the application meeting or reminder.')
  await persistApplicationEvidence(admin, context, {
    kind: 'calendar_event',
    excerpt: `Calendar confirmed ${safeString(calendarArguments.summary, 1_000)}.`,
    metadata: { event_id: safeString(event.id, 256), start: calendarArguments.start, end: calendarArguments.end, timezone: calendarArguments.timezone },
    idempotencyKey: `application-calendar:${context.request.id}`,
  })
  const caseData = recordValue(context.applicationCase.data)
  const eventIds = stringArray(caseData.calendarEventIds)
  if (safeString(event.id, 256) && !eventIds.includes(safeString(event.id, 256))) eventIds.push(safeString(event.id, 256))
  const updatedCase = await admin.from('application_cases').update({ current_stage: 'interview', status: 'interview', next_action: 'Prepare for the scheduled application meeting.', data: { ...caseData, calendarEventIds: eventIds } }).eq('id', context.request.application_case_id).eq('user_id', context.request.user_id)
  if (updatedCase.error) throw new Error(updatedCase.error.message)
  return { status: 'completed', result: { kind: 'calendar_event', event_id: safeString(event.id, 256), html_link: safeString(event.htmlLink ?? event.html_link, 2_000), already_created: event.already_created === true } }
}

async function applicationMessagesForRequest(admin: AdminClient, context: ApplicationRequestContext, payload: Record<string, unknown>) {
  const requestedAt = safeString(payload.requested_at ?? payload.requestedAt, 80) || context.request.created_at || new Date().toISOString()
  const requestedDate = new Date(requestedAt)
  if (Number.isNaN(requestedDate.getTime())) throw new Error('The application message monitor timestamp is invalid.')
  const threadId = safeString(payload.thread_id ?? payload.threadId, 256)
  if (threadId) {
    const thread = await executeGoogleTool(admin, context.request.user_id, 'gmail.read_thread', { thread_id: threadId, sent_message_id: safeString(payload.sent_message_id ?? payload.sentMessageId, 256) || null }, `application-roon-thread:${context.request.id}`)
    return { requestedAt: requestedDate, messages: Array.isArray(thread.value.messages) ? thread.value.messages as Array<Record<string, unknown>> : [] }
  }
  const after = `${requestedDate.getUTCFullYear()}/${String(requestedDate.getUTCMonth() + 1).padStart(2, '0')}/${String(requestedDate.getUTCDate()).padStart(2, '0')}`
  const search = await executeGoogleTool(admin, context.request.user_id, 'gmail.search_messages', { query: applicationMessageQuery(payload, after), max_results: 25 }, `application-roon-message-search:${context.request.id}`)
  const candidates = Array.isArray(search.value.messages) ? search.value.messages as Array<Record<string, unknown>> : []
  const messages: Array<Record<string, unknown>> = []
  for (const candidate of candidates.slice(0, 25)) {
    const id = safeString(candidate.id, 256)
    if (!id) continue
    const read = await executeGoogleTool(admin, context.request.user_id, 'gmail.read_message', { message_id: id }, `application-roon-message-read:${context.request.id}:${id}`)
    messages.push(read.value)
  }
  return { requestedAt: requestedDate, messages }
}

function classifyApplicationContactReply(subject: string, body: string, contactKind: string) {
  const textValue = `${subject} ${body}`.toLocaleLowerCase()
  if (contactKind === 'professor') {
    if (/\b(?:unsubscribe|do not contact|stop emailing|remove me)\b/.test(textValue)) return 'professor_opt_out'
    if (/\b(?:not interested|cannot|can't|unable|no openings|decline)\b/.test(textValue)) return 'professor_decline'
    if (/\b(?:send|share|forward)\b[\s\S]{0,80}\b(?:cv|resume|paper|proposal|materials?)\b/.test(textValue)) return 'request_for_material'
    if (/\b(?:meet|meeting|call|zoom|conversation|schedule)\b/.test(textValue)) return 'meeting_request'
    if (/\b(?:interested|intrigued|sounds promising|would be happy|let's discuss)\b/.test(textValue)) return 'professor_interest'
  }
  return classifyApplicationReply(subject, body)
}

async function processApplicationMessageMonitorRequest(admin: AdminClient, context: ApplicationRequestContext) {
  const payload = recordValue(context.request.payload)
  const kind = safeApplicationRequestKind(context.request.request_kind)
  const assignmentThreadId = safeString(context.assignment?.gmail_thread_id, 256)
  const effectivePayload = assignmentThreadId && !safeString(payload.thread_id ?? payload.threadId, 256)
    ? { ...payload, thread_id: assignmentThreadId }
    : payload
  const { requestedAt, messages } = await applicationMessagesForRequest(admin, context, effectivePayload)
  const integration = await admin.from('agent_integrations').select('account_email').eq('user_id', context.request.user_id).eq('provider', 'google').maybeSingle()
  if (integration.error) throw new Error(integration.error.message)
  const accountEmail = safeString(integration.data?.account_email, 320)
  const candidate = messages
    .filter(message => messageDateAfter(message.date, requestedAt.toISOString()))
    .filter(message => !messageFromUser(message.from, accountEmail))
    .filter(message => {
      const expectedThread = safeString(effectivePayload.thread_id ?? effectivePayload.threadId, 256)
      return !expectedThread || safeString(message.thread_id ?? message.threadId, 256) === expectedThread
    })
    .sort((left, right) => Date.parse(safeString(right.date, 240)) - Date.parse(safeString(left.date, 240)))[0]
  if (!candidate) {
    return { status: 'queued', result: { code: 'application_message_not_found_yet', searched_after: requestedAt.toISOString() }, nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }
  }
  const messageId = safeString(candidate.id, 256)
  const threadId = safeString(candidate.thread_id ?? candidate.threadId, 256) || null
  const subject = safeString(candidate.subject, 998)
  const excerpt = redactApplicationExcerpt(candidate.body_text ?? candidate.snippet)
  const contactKind = safeString(payload.contact_kind ?? payload.contactKind, 80) || (context.assignment ? 'writer' : '')
  const classification = classifyApplicationContactReply(subject, excerpt, contactKind)
  let replyArtifactIds: string[] = []
  let replyAssetIds: string[] = []
  if (['writer', 'editor', 'referee', 'administrator'].includes(contactKind)) {
    const attachmentMetadata = Array.isArray(candidate.attachments) ? candidate.attachments as Array<Record<string, unknown>> : []
    if (attachmentMetadata.length) {
      const attachmentResult = await executeGoogleTool(admin, context.request.user_id, 'gmail.read_attachments', {
        message_id: messageId,
        attachment_ids: attachmentMetadata.map(attachment => safeString(attachment.attachment_id ?? attachment.name, 256)).filter(Boolean),
      }, `application-roon-attachments:${context.request.id}:${messageId}`)
      const persisted = await persistApplicationReplyAttachments(admin, context, candidate, attachmentResult.value.attachments, { contactKind })
      replyArtifactIds = persisted.artifactIds
      replyAssetIds = persisted.assetIds
    }
  }
  const communicationId = await persistApplicationCommunication(admin, context, {
    contactId: safeString(payload.contact_id ?? payload.contactId, 80) || null,
    direction: 'inbound',
    providerMessageId: messageId,
    providerThreadId: threadId,
    classification,
    subject,
    excerpt,
    idempotencyKey: `application-inbound:${context.request.id}:${messageId}`,
    humanAssignmentId: safeString(payload.human_assignment_id ?? payload.humanAssignmentId, 80) || safeString(context.assignment?.id, 80) || null,
    data: { received_at: safeString(candidate.date, 80), from: safeString(candidate.from, 320), request_kind: kind, writer_artifact_ids: replyArtifactIds, reply_artifact_ids: replyArtifactIds },
  })
  const evidenceId = await persistApplicationEvidence(admin, context, {
    kind: 'received_message',
    providerMessageId: messageId,
    providerThreadId: threadId,
    excerpt,
    metadata: { classification, subject, received_at: safeString(candidate.date, 80), communication_id: communicationId, reply_artifact_ids: replyArtifactIds, reply_asset_ids: replyAssetIds },
    assetId: replyAssetIds[0] ?? null,
    idempotencyKey: `application-inbound-evidence:${context.request.id}:${messageId}`,
  })
  await updateApplicationContact(admin, context, safeString(payload.contact_id ?? payload.contactId, 80), threadId, messageId)
  const stateChange = nextApplicationCaseState(classification as never)
  const caseData = recordValue(context.applicationCase.data)
  const outcomeKey = contactKind === 'professor' ? 'professorOutcomes' : contactKind === 'referee' ? 'refereeOutcomes' : 'contactOutcomes'
  const outcomes = recordValue(caseData[outcomeKey])
  const contactKey = safeString(payload.contact_id ?? payload.contactId, 80) || safeString(candidate.from, 320)
  outcomes[contactKey] = { classification, messageId, threadId, receivedAt: safeString(candidate.date, 80), evidenceId }
  const priorReferenceArtifacts = stringArray(caseData.refereeArtifactIds)
  const updatedCase = await admin.from('application_cases').update({ status: stateChange.status, current_stage: stateChange.currentStage, next_action: contactKind === 'professor' && classification === 'meeting_request' ? 'Ask Roon to schedule the approved professor meeting.' : stateChange.nextAction, data: { ...caseData, [outcomeKey]: outcomes, latestReplyClassification: classification, ...(contactKind === 'referee' && replyArtifactIds.length ? { refereeArtifactIds: [...new Set([...priorReferenceArtifacts, ...replyArtifactIds])] } : {}) } }).eq('id', context.request.application_case_id).eq('user_id', context.request.user_id)
  if (updatedCase.error) throw new Error(updatedCase.error.message)
  if (contactKind === 'referee' && replyArtifactIds.length) {
    const requirement = await admin.from('application_requirements').select('id').eq('application_case_id', context.request.application_case_id).eq('user_id', context.request.user_id).eq('category', 'reference').in('status', ['unknown', 'in_progress', 'awaiting_referee', 'ready']).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (requirement.error) throw new Error(requirement.error.message)
    if (requirement.data) {
      const linked = await admin.from('application_requirements').update({ status: 'ready', linked_artifact_id: replyArtifactIds[0], blocker_reason: null }).eq('id', requirement.data.id).eq('user_id', context.request.user_id)
      if (linked.error) throw new Error(linked.error.message)
    }
  }
  if (context.assignment && (contactKind === 'writer' || contactKind === 'editor' || Boolean(payload.human_assignment_id ?? payload.humanAssignmentId))) {
    const isQuestion = /\?|\b(?:question|clarif|which|what do you mean|missing information)\b/i.test(`${subject} ${excerpt}`)
    const requestsRevision = /\b(?:revision|revise|change|feedback|edit|correction)\b/i.test(`${subject} ${excerpt}`)
    const isFinal = /\b(?:final|complete|ready for review|finished)\b/i.test(`${subject} ${excerpt}`)
    const text = `${subject} ${excerpt}`
    const refused = /\b(?:decline|declined|refus|unable|cannot take|not available)\b/i.test(text)
    const accepted = /\b(?:accept|accepted|happy to|can take|available|confirmed)\b/i.test(text)
    const assignmentStatus = refused ? 'cancelled' : isQuestion ? 'awaiting_question' : requestsRevision ? 'revision_requested' : accepted ? 'in_progress' : 'quality_review'
    const questions = Array.isArray(context.assignment.questions) ? context.assignment.questions.map(value => safeString(value, 2_000)).filter(Boolean) : []
    if (isQuestion && !questions.includes(excerpt)) questions.push(excerpt)
    const priorReview = recordValue(context.assignment.quality_review)
    const review = { ...priorReview, received_message_id: messageId, thread_id: threadId, classification, writer_artifact_ids: replyArtifactIds, is_final: isFinal, reviewed_at: new Date().toISOString() }
    const assignmentUpdate = await admin.from('human_assignments').update({ status: assignmentStatus, questions, revisions: Number(context.assignment.revisions ?? 0) + (requestsRevision ? 1 : 0), final_artifact_id: isFinal && replyArtifactIds[0] ? replyArtifactIds[0] : context.assignment.final_artifact_id ?? null, gmail_thread_id: threadId ?? context.assignment.gmail_thread_id ?? null, last_provider_message_id: messageId, quality_review: review }).eq('id', context.assignment.id).eq('user_id', context.request.user_id)
    if (assignmentUpdate.error) throw new Error(assignmentUpdate.error.message)
    if (assignmentStatus === 'cancelled' && !['cancelled', 'approved'].includes(safeString(context.assignment.status, 80))) {
      await releaseWriterLoad(admin, context, safeString(context.assignment.writer_id, 160))
    }
  }
  await recordApplicationWorkerEvent(admin, context, 'application_message_received', 'succeeded', 'Roon attached and classified the application message on the existing case.', { message_id: messageId, thread_id: threadId, classification, evidence_id: evidenceId })
  return { status: 'completed', result: { kind: 'application_reply', classification, message_id: messageId, thread_id: threadId, subject, received_at: safeString(candidate.date, 80), excerpt, writer_artifact_ids: replyArtifactIds, reply_artifact_ids: replyArtifactIds, evidence_id: evidenceId } }
}

async function processApplicationDeadlineRequest(admin: AdminClient, context: ApplicationRequestContext) {
  const assignment = context.assignment
  if (!assignment) throw new Error('A deadline monitor needs a human assignment.')
  const deadlineAt = Date.parse(safeString(assignment.deadline_at, 80))
  if (!Number.isFinite(deadlineAt)) return { status: 'completed', result: { kind: 'deadline_monitor', status: 'no_deadline' } }
  const now = Date.now()
  if (deadlineAt <= now && !['approved', 'cancelled'].includes(safeString(assignment.status, 80))) {
    const breaches = Array.isArray(assignment.sla_breaches) ? assignment.sla_breaches : []
    const breach = `Deadline passed at ${new Date(deadlineAt).toISOString()}`
    if (!breaches.includes(breach)) breaches.push(breach)
    const updated = await admin.from('human_assignments').update({ status: 'overdue', escalation_level: Number(assignment.escalation_level ?? 0) + 1, sla_breaches: breaches }).eq('id', assignment.id).eq('user_id', context.request.user_id)
    if (updated.error) throw new Error(updated.error.message)
    await recordApplicationWorkerEvent(admin, context, 'application_deadline_overdue', 'failed', 'A writer or referee deadline was missed; David should escalate or select a replacement.', { assignment_id: assignment.id, deadline_at: new Date(deadlineAt).toISOString() })
    return { status: 'completed', result: { kind: 'deadline_monitor', status: 'overdue', assignment_id: assignment.id, escalation_level: Number(assignment.escalation_level ?? 0) + 1 } }
  }
  return { status: 'queued', result: { kind: 'deadline_monitor', status: 'on_track', assignment_id: assignment.id, deadline_at: new Date(deadlineAt).toISOString() }, nextAttemptAt: new Date(Math.min(deadlineAt, now + 24 * 60 * 60 * 1000)).toISOString() }
}

async function queuedApplicationRoonRequests(admin: AdminClient, kinds: string[], limit = 12) {
  let query = admin.from('application_inter_agent_requests')
    .select('id,user_id,task_id,agent_run_id,application_case_id,from_specialist_id,to_specialist_id,request_kind,payload,status,result,human_assignment_id,attempt_count')
    .eq('from_specialist_id', 'david')
    .eq('to_specialist_id', 'roon')
    .eq('status', 'queued')
    .in('request_kind', kinds)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('updated_at', { ascending: true })
    .limit(limit)
  const result = await query
  if (result.error) {
    if (result.error.code === '42P01') return []
    throw new Error(result.error.message)
  }
  return (result.data ?? []) as ApplicationRequestRow[]
}

async function processApplicationRoonRequests(admin: AdminClient) {
  const kinds = ['create_draft', 'send_email', 'follow_up', 'resolve_contact', 'monitor_thread', 'read_application_reply', 'schedule_interview', 'schedule_meeting', 'create_calendar_reminder', 'monitor_writer_deadline', 'monitor_referee_deadline', 'monitor_professor_reply', 'detect_application_messages']
  const queued = await queuedApplicationRoonRequests(admin, kinds, 16)
  const counts = { checked: queued.length, completed: 0, pending: 0, failed: 0 }
  for (const row of queued) {
    let context: ApplicationRequestContext | null = null
    try {
      const claimed = await claimApplicationRequest(admin, row)
      if (!claimed) continue
      context = await loadApplicationRequestContext(admin, claimed)
      const kind = safeApplicationRequestKind(claimed.request_kind)
      let result: { status: string; result: Record<string, unknown>; nextAttemptAt?: string }
      if (['create_draft', 'send_email', 'follow_up'].includes(kind ?? '')) result = await processApplicationEmailRequest(admin, context)
      else if (kind === 'resolve_contact') result = await processApplicationContactRequest(admin, context)
      else if (['schedule_interview', 'schedule_meeting', 'create_calendar_reminder'].includes(kind ?? '')) result = await processApplicationCalendarRequest(admin, context)
      else if (['monitor_writer_deadline', 'monitor_referee_deadline'].includes(kind ?? '')) result = await processApplicationDeadlineRequest(admin, context)
      else result = await processApplicationMessageMonitorRequest(admin, context)
      await updateApplicationRequest(admin, claimed.id, result.status, result.result, {
        next_attempt_at: result.nextAttemptAt ?? null,
        completion_evidence: { provider: ['create_draft', 'send_email', 'follow_up', 'resolve_contact', 'monitor_thread', 'read_application_reply', 'monitor_professor_reply', 'detect_application_messages'].includes(kind ?? '') ? 'gmail' : ['schedule_interview', 'schedule_meeting', 'create_calendar_reminder'].includes(kind ?? '') ? 'calendar' : 'application_state', completed_at: result.status === 'completed' ? new Date().toISOString() : null },
        provider_action_id: safeString(result.result.message_id ?? result.result.event_id ?? result.result.contact_id, 256) || null,
      })
      if (result.status === 'completed') counts.completed += 1
      else if (result.status === 'waiting_user') counts.failed += 1
      else counts.pending += 1
    } catch (error) {
      const retryable = error instanceof GoogleIntegrationError ? error.retryable : applicationFailureIsRetryable(error)
      const attempt = Number(row.attempt_count ?? 0) + 1
      const status = retryable && attempt < 4 ? 'queued' : 'failed'
      const retryAt = new Date(Date.now() + Math.min(30 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempt - 1))).toISOString()
      const code = error instanceof GoogleIntegrationError ? error.code : 'application_roon_worker_error'
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Roon could not complete the application action.'
      await admin.from('application_inter_agent_requests').update({ status, result: { code, message }, last_error: { code, message, retryable }, next_attempt_at: status === 'queued' ? retryAt : null }).eq('id', row.id).eq('status', 'running')
      if (context) await recordApplicationWorkerEvent(admin, context, status === 'queued' ? 'application_worker_retry_scheduled' : 'application_worker_failed', status === 'queued' ? 'waiting_external' : 'failed', message, { code, retryable, attempt })
      if (status === 'queued') counts.pending += 1
      else counts.failed += 1
    }
  }
  return counts
}


async function deliverApplicationOtpContinuation(
  supabaseUrl: string,
  serviceRoleKey: string,
  internalWorkerToken: string,
  request: { id: string; agent_run_id: string },
  matched: { code: string; redactedCode: string; messageId: string | null; threadId: string | null },
) {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/task-agent`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'X-ShotCount-Internal-Worker': internalWorkerToken,
    },
    body: JSON.stringify({
      action: 'deliver_application_otp',
      runId: request.agent_run_id,
      requestId: request.id,
      otpCode: matched.code,
      otpRedacted: matched.redactedCode,
      otpMessageId: matched.messageId,
      otpThreadId: matched.threadId,
    }),
  })
  if (!response.ok) throw new Error('David’s application run could not receive the matched verification email yet.')
}

async function processApplicationOtpRequests(admin: AdminClient, continuation?: { supabaseUrl: string; serviceRoleKey: string; internalWorkerToken: string }) {
  const queued = await admin
    .from('application_inter_agent_requests')
    .select('id,user_id,task_id,agent_run_id,application_case_id,from_specialist_id,to_specialist_id,request_kind,payload,status')
    .eq('from_specialist_id', 'david')
    .eq('to_specialist_id', 'roon')
    .eq('request_kind', 'search_otp')
    .eq('status', 'queued')
    .order('updated_at', { ascending: true })
    .limit(4)
  if (queued.error) {
    if (queued.error.code === '42P01') return { checked: 0, completed: 0, pending: 0, failed: 0 }
    throw new Error(queued.error.message)
  }
  let completed = 0
  let pending = 0
  let failed = 0
  for (const request of queued.data ?? []) {
    const claimed = await admin.from('application_inter_agent_requests')
      .update({ status: 'running' })
      .eq('id', request.id)
      .eq('status', 'queued')
      .select('id,user_id,task_id,agent_run_id,application_case_id,from_specialist_id,to_specialist_id,request_kind,payload,status')
      .maybeSingle()
    if (claimed.error) {
      failed += 1
      continue
    }
    if (!claimed.data) continue
    const payload = claimed.data.payload && typeof claimed.data.payload === 'object' && !Array.isArray(claimed.data.payload)
      ? claimed.data.payload as Record<string, unknown>
      : {}
    const institution = safeString(payload.institution, 240)
    const portal = safeString(payload.portal, 240)
    const destinationEmail = safeString(payload.destination_email ?? payload.destinationEmail, 320).toLocaleLowerCase()
    const requestedAt = safeString(payload.requested_at ?? payload.requestedAt, 80)
    const applicationCaseId = safeString(claimed.data.application_case_id, 80)
    if (!institution || !portal || !destinationEmail || !requestedAt || !applicationCaseId) {
      await admin.from('application_inter_agent_requests').update({
        status: 'failed',
        result: { code: 'otp_request_incomplete', message: 'Institution, portal, destination email, application case, and request time are required.' },
      }).eq('id', request.id).eq('status', 'running')
      failed += 1
      continue
    }
    const requestedDate = new Date(requestedAt)
    if (Number.isNaN(requestedDate.getTime())) {
      await admin.from('application_inter_agent_requests').update({
        status: 'failed',
        result: { code: 'otp_request_time_invalid', message: 'The OTP request timestamp is invalid.' },
      }).eq('id', request.id).eq('status', 'running')
      failed += 1
      continue
    }
    const after = `${requestedDate.getUTCFullYear()}/${String(requestedDate.getUTCMonth() + 1).padStart(2, '0')}/${String(requestedDate.getUTCDate()).padStart(2, '0')}`
    const senderClueValues = Array.isArray(payload.sender_clues)
      ? payload.sender_clues
      : Array.isArray(payload.senderClues)
        ? payload.senderClues
        : []
    const subjectClueValues = Array.isArray(payload.subject_clues)
      ? payload.subject_clues
      : Array.isArray(payload.subjectClues)
        ? payload.subjectClues
        : []
    const senderClues = senderClueValues.map((value: unknown) => gmailSearchTerm(value, 120)).filter(Boolean)
    const subjectClues = subjectClueValues.map((value: unknown) => gmailSearchTerm(value, 120)).filter(Boolean)
    const queryParts = [`after:${after}`, `to:${gmailSearchTerm(destinationEmail, 320)}`]
    if (subjectClues.length) queryParts.push(`{${subjectClues.map(value => `subject:"${value}"`).join(' OR ')}}`)
    else if (senderClues.length) queryParts.push(`{${senderClues.map(value => `from:${value}`).join(' OR ')}}`)
    try {
      const search = await executeGoogleTool(admin, claimed.data.user_id, 'gmail.search_messages', {
        query: queryParts.join(' '),
        max_results: 10,
      }, `application-otp-search:${request.id}`)
      const candidates = Array.isArray(search.value.messages) ? search.value.messages as Array<Record<string, unknown>> : []
      const messages: OtpMessage[] = []
      for (const candidate of candidates.slice(0, 10)) {
        const messageId = safeString(candidate.id, 256)
        if (!messageId) continue
        const read = await executeGoogleTool(admin, claimed.data.user_id, 'gmail.read_message', { message_id: messageId }, `application-otp-read:${request.id}:${messageId}`)
        const value = read.value as Record<string, unknown>
        const date = new Date(safeString(value.date, 240))
        if (Number.isNaN(date.getTime())) continue
        messages.push({
          id: messageId,
          threadId: safeString(value.thread_id, 256) || null,
          from: safeString(value.from, 320),
          to: safeString(value.to, 320),
          subject: safeString(value.subject, 998),
          body: safeString(value.body_text ?? value.snippet, 40_000),
          receivedAt: date.toISOString(),
          applicationCaseId,
        })
      }
      const otpRequest: OtpRequest = {
        applicationCaseId,
        institution,
        portal,
        destinationEmail,
        requestedAt: requestedDate.toISOString(),
        senderClues,
        subjectClues,
      }
      const matched = matchApplicationOtp(otpRequest, messages)
      if (!matched) {
        await admin.from('application_inter_agent_requests').update({
          status: 'queued',
          result: { code: 'otp_not_found_yet', searched_after: requestedDate.toISOString(), last_query: queryParts.join(' ') },
        }).eq('id', request.id).eq('status', 'running')
        pending += 1
        continue
      }
      const codeHash = await sha256(matched.code)
      const capturedAt = new Date().toISOString()
      const otpEvent = await admin.from('application_otp_events').upsert({
        user_id: claimed.data.user_id,
        application_case_id: applicationCaseId,
        institution,
        portal,
        destination_email: destinationEmail,
        requested_at: requestedDate.toISOString(),
        matched_message_id: matched.messageId,
        matched_thread_id: matched.threadId,
        matched_at: capturedAt,
        code_hash: codeHash,
        idempotency_key: `otp:${request.id}`,
      }, { onConflict: 'application_case_id,idempotency_key' })
      if (otpEvent.error) throw new Error(otpEvent.error.message)
      const otpEvidence = await admin.from('application_evidence').upsert({
        user_id: claimed.data.user_id,
        application_case_id: applicationCaseId,
        task_id: safeString(claimed.data.task_id, 80) || null,
        agent_run_id: safeString(claimed.data.agent_run_id, 80) || null,
        kind: 'otp_retrieval',
        provider: 'gmail',
        provider_message_id: matched.messageId,
        provider_thread_id: matched.threadId,
        excerpt: `Verification email matched for ${institution}. Code ${matched.redactedCode}.`,
        metadata: { redacted_code: matched.redactedCode, requested_at: requestedDate.toISOString(), captured_at: capturedAt },
        idempotency_key: `otp:${request.id}`,
      }, { onConflict: 'user_id,application_case_id,idempotency_key' })
      if (otpEvidence.error) throw new Error(otpEvidence.error.message)
      if (!continuation) throw new Error('The in-memory OTP continuation is not configured.')
      await deliverApplicationOtpContinuation(continuation.supabaseUrl, continuation.serviceRoleKey, continuation.internalWorkerToken, {
        id: String(request.id),
        agent_run_id: safeString(claimed.data.agent_run_id, 80),
      }, {
        code: matched.code,
        redactedCode: matched.redactedCode,
        messageId: matched.messageId,
        threadId: matched.threadId,
      })
      completed += 1
    } catch (error) {
      const retryable = error instanceof GoogleIntegrationError ? error.retryable : true
      await admin.from('application_inter_agent_requests').update({
        status: retryable ? 'queued' : 'failed',
        result: { code: error instanceof GoogleIntegrationError ? error.code : 'otp_worker_error', message: error instanceof Error ? error.message.slice(0, 500) : 'OTP retrieval failed.' },
      }).eq('id', request.id).eq('status', 'running')
      if (retryable) pending += 1
      else failed += 1
    }
  }
  return { checked: queued.data?.length ?? 0, completed, pending, failed }
}

async function processApplicationReplyRequests(admin: AdminClient) {
  const queued = await admin
    .from('application_inter_agent_requests')
    .select('id,user_id,application_case_id,from_specialist_id,to_specialist_id,request_kind,payload,status')
    .eq('from_specialist_id', 'david')
    .eq('to_specialist_id', 'roon')
    .eq('request_kind', 'read_application_reply')
    .eq('status', 'queued')
    .order('updated_at', { ascending: true })
    .limit(4)
  if (queued.error) {
    if (queued.error.code === '42P01') return { checked: 0, completed: 0, pending: 0, failed: 0 }
    throw new Error(queued.error.message)
  }
  let completed = 0
  let pending = 0
  let failed = 0
  for (const request of queued.data ?? []) {
    const claimed = await admin.from('application_inter_agent_requests')
      .update({ status: 'running' })
      .eq('id', request.id)
      .eq('status', 'queued')
      .select('id,user_id,application_case_id,request_kind,payload,status')
      .maybeSingle()
    if (claimed.error || !claimed.data) {
      if (claimed.error) failed += 1
      continue
    }
    const payload = claimed.data.payload && typeof claimed.data.payload === 'object' && !Array.isArray(claimed.data.payload)
      ? claimed.data.payload as Record<string, unknown>
      : {}
    const applicationCaseId = safeString(claimed.data.application_case_id, 80)
    const requestedAt = safeString(payload.requested_at ?? payload.requestedAt, 80)
    const requestedDate = new Date(requestedAt)
    const destinationEmail = safeString(payload.destination_email ?? payload.destinationEmail, 320).toLocaleLowerCase()
    const institution = safeString(payload.institution, 240)
    if (!applicationCaseId || Number.isNaN(requestedDate.getTime())) {
      await admin.from('application_inter_agent_requests').update({ status: 'failed', result: { code: 'application_reply_request_incomplete', message: 'An application case and valid request timestamp are required.' } }).eq('id', request.id).eq('status', 'running')
      failed += 1
      continue
    }
    const after = `${requestedDate.getUTCFullYear()}/${String(requestedDate.getUTCMonth() + 1).padStart(2, '0')}/${String(requestedDate.getUTCDate()).padStart(2, '0')}`
    const senderValues = Array.isArray(payload.sender_clues) ? payload.sender_clues : Array.isArray(payload.senderClues) ? payload.senderClues : []
    const subjectValues = Array.isArray(payload.subject_clues) ? payload.subject_clues : Array.isArray(payload.subjectClues) ? payload.subjectClues : []
    const senderClues = senderValues.map((value: unknown) => gmailSearchTerm(value, 120)).filter(Boolean)
    const subjectClues = subjectValues.map((value: unknown) => gmailSearchTerm(value, 120)).filter(Boolean)
    const queryParts = [`after:${after}`]
    if (destinationEmail) queryParts.push(`to:${gmailSearchTerm(destinationEmail, 320)}`)
    if (subjectClues.length) queryParts.push(`{${subjectClues.map((value: string) => `subject:"${value}"`).join(' OR ')}}`)
    else if (senderClues.length) queryParts.push(`{${senderClues.map((value: string) => `from:${value}`).join(' OR ')}}`)
    try {
      const search = await executeGoogleTool(admin, claimed.data.user_id, 'gmail.search_messages', { query: queryParts.join(' '), max_results: 10 }, `application-reply-search:${request.id}`)
      const candidates = Array.isArray(search.value.messages) ? search.value.messages as Array<Record<string, unknown>> : []
      let matched: { id: string; threadId: string | null; subject: string; body: string; receivedAt: string } | null = null
      for (const candidate of candidates.slice(0, 10)) {
        const messageId = safeString(candidate.id, 256)
        if (!messageId) continue
        const read = await executeGoogleTool(admin, claimed.data.user_id, 'gmail.read_message', { message_id: messageId }, `application-reply-read:${request.id}:${messageId}`)
        const value = read.value as Record<string, unknown>
        const receivedAt = new Date(safeString(value.date, 240))
        if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() < requestedDate.getTime()) continue
        const subject = safeString(value.subject, 998)
        const body = safeString(value.body_text ?? value.snippet, 40_000)
        const haystack = `${subject} ${body}`.toLocaleLowerCase()
        if (institution && !haystack.includes(institution.toLocaleLowerCase()) && !subjectClues.length && !senderClues.length) continue
        matched = { id: messageId, threadId: safeString(value.thread_id, 256) || null, subject, body, receivedAt: receivedAt.toISOString() }
        break
      }
      if (!matched) {
        await admin.from('application_inter_agent_requests').update({ status: 'queued', result: { code: 'application_reply_not_found_yet', searched_after: requestedDate.toISOString(), last_query: queryParts.join(' ') } }).eq('id', request.id).eq('status', 'running')
        pending += 1
        continue
      }
      const excerpt = redactApplicationExcerpt(matched.body)
      const classification = classifyApplicationReply(matched.subject, excerpt)
      const communication = await admin.from('application_communications').upsert({
        user_id: claimed.data.user_id,
        application_case_id: applicationCaseId,
        contact_id: safeString(payload.contact_id, 80) || null,
        provider: 'gmail',
        provider_message_id: matched.id,
        provider_thread_id: matched.threadId,
        direction: 'inbound',
        classification,
        data: { subject: matched.subject, excerpt, received_at: matched.receivedAt },
        idempotency_key: `reply:${request.id}:${matched.id}`,
      }, { onConflict: 'user_id,application_case_id,idempotency_key' }).select('id').maybeSingle()
      if (communication.error) throw new Error(communication.error.message)
      const caseResult = await admin.from('application_cases').select('id,data').eq('id', applicationCaseId).eq('user_id', claimed.data.user_id).maybeSingle()
      if (caseResult.error || !caseResult.data) throw new Error(caseResult.error?.message ?? 'Application case not found while recording the reply.')
      const stateChange = nextApplicationCaseState(classification)
      const caseData = caseResult.data.data && typeof caseResult.data.data === 'object' && !Array.isArray(caseResult.data.data) ? caseResult.data.data as Record<string, unknown> : {}
      const communicationIds = Array.isArray(caseData.communicationIds) ? caseData.communicationIds.map((value: unknown) => safeString(value, 80)).filter(Boolean) : []
      if (communication.data?.id && !communicationIds.includes(communication.data.id)) communicationIds.push(communication.data.id)
      const updatedCase = await admin.from('application_cases').update({ status: stateChange.status, current_stage: stateChange.currentStage, next_action: stateChange.nextAction, data: { ...caseData, communicationIds, latestReplyClassification: classification } }).eq('id', applicationCaseId).eq('user_id', claimed.data.user_id)
      if (updatedCase.error) throw new Error(updatedCase.error.message)
      const replyEvidence = await admin.from('application_evidence').upsert({
        user_id: claimed.data.user_id,
        application_case_id: applicationCaseId,
        kind: 'status_email',
        provider: 'gmail',
        provider_message_id: matched.id,
        provider_thread_id: matched.threadId,
        excerpt: excerpt || null,
        metadata: { classification, received_at: matched.receivedAt },
        idempotency_key: `reply-status:${request.id}:${matched.id}`,
      }, { onConflict: 'user_id,application_case_id,idempotency_key' })
      if (replyEvidence.error) throw new Error(replyEvidence.error.message)
      await admin.from('application_inter_agent_requests').update({ status: 'completed', result: { kind: 'application_reply', classification, message_id: matched.id, thread_id: matched.threadId, subject: matched.subject, received_at: matched.receivedAt } }).eq('id', request.id).eq('status', 'running')
      completed += 1
    } catch (error) {
      const retryable = error instanceof GoogleIntegrationError ? error.retryable : true
      await admin.from('application_inter_agent_requests').update({ status: retryable ? 'queued' : 'failed', result: { code: error instanceof GoogleIntegrationError ? error.code : 'application_reply_worker_error', message: error instanceof Error ? error.message.slice(0, 500) : 'Application reply monitoring failed.' } }).eq('id', request.id).eq('status', 'running')
      if (retryable) pending += 1
      else failed += 1
    }
  }
  return { checked: queued.data?.length ?? 0, completed, pending, failed }
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const configuredCronToken = Deno.env.get('SHOTCOUNT_CRON_TOKEN') ?? ''
  const suppliedCronToken = request.headers.get('x-shotcount-cron-token') ?? ''
  if (!secureStringEqual(suppliedCronToken, configuredCronToken)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const internalWorkerToken = Deno.env.get('SHOTCOUNT_INTERNAL_WORKER_TOKEN') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !internalWorkerToken) {
    return jsonResponse({ error: 'Sweep configuration is incomplete' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  let applicationHandoffs = { checked: 0, completed: 0, pending: 0, failed: 0 }
  let applicationRoon = { checked: 0, completed: 0, pending: 0, failed: 0 }
  let applicationReplies = { checked: 0, completed: 0, pending: 0, failed: 0 }
  try {
    applicationHandoffs = await processApplicationOtpRequests(admin, { supabaseUrl, serviceRoleKey, internalWorkerToken })
  } catch {
    applicationHandoffs = { checked: 0, completed: 0, pending: 0, failed: 1 }
  }
  try {
    applicationRoon = await processApplicationRoonRequests(admin)
  } catch {
    applicationRoon = { checked: 0, completed: 0, pending: 0, failed: 1 }
  }
  try {
    applicationReplies = await processApplicationReplyRequests(admin)
  } catch {
    applicationReplies = { checked: 0, completed: 0, pending: 0, failed: 1 }
  }
  const waitingResult = await admin
    .from('agent_runs')
    .select('id')
    .eq('status', 'waiting_external')
    .order('updated_at', { ascending: true })
    .limit(8)
  const staleCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString()
  const stalledResult = await admin
    .from('agent_runs')
    .select('id')
    .in('status', ['planning', 'running'])
    // Flights are driven by their isolated browser session. Restarting a
    // stalled model turn from the cron sweep can replay the visible progress
    // instead of waiting for that session's authoritative update.
    .neq('capability', 'flight_search')
    .lt('updated_at', staleCutoff)
    .order('updated_at', { ascending: true })
    .limit(8)
  if (waitingResult.error || stalledResult.error) {
    return jsonResponse({ error: 'Could not load waiting runs' }, 502)
  }

  const taskAgentEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/task-agent`
  const runIds = [...new Set([
    ...(waitingResult.data ?? []).map(run => String(run.id)),
    ...(stalledResult.data ?? []).map(run => String(run.id)),
  ])].slice(0, 8)
  let continued = 0
  let unchanged = 0
  let failed = 0

  for (let index = 0; index < runIds.length; index += 2) {
    const batch = runIds.slice(index, index + 2)
    const outcomes = await Promise.all(batch.map(async runId => {
      try {
        const result = await fetch(taskAgentEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'X-ShotCount-Internal-Worker': internalWorkerToken,
          },
          body: JSON.stringify({ action: 'poll', runId }),
        })
        if (!result.ok) return 'failed'
        const payload = await result.json() as { status?: string }
        return ['waiting_external', 'planning', 'running'].includes(payload.status ?? '')
          ? 'unchanged'
          : 'continued'
      } catch {
        return 'failed'
      }
    }))

    for (const outcome of outcomes) {
      if (outcome === 'continued') continued += 1
      else if (outcome === 'unchanged') unchanged += 1
      else failed += 1
    }
  }

  return jsonResponse({
    ok: failed === 0,
    checked: runIds.length,
    continued,
    unchanged,
    failed,
    application_handoffs: applicationHandoffs,
    application_roon: applicationRoon,
    application_replies: applicationReplies,
  }, failed ? 207 : 200)
})
