export type AgentRisk = 'read' | 'prepare' | 'external_write' | 'financial'

export type AgentToolDefinition = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: boolean
}

type ToolPolicy = {
  risk: AgentRisk
  approvalKind: 'send_email' | 'calendar_write' | 'browser_submit' | null
}

export type AgentExecutionDateContext = {
  utc_time: string
  timezone: string
  local_date: string
  relative_dates: Array<{
    phrase: string
    date?: string
    start_date?: string
    end_date?: string
  }>
}

export type AgentCompletionEvidence = {
  taskCompletionPolicy: 'prepared_result' | 'external_change' | 'payment_handoff'
  capability: string
  preparedResult: boolean
  externalChangeConfirmed: boolean
  purchaseConfirmed: boolean
  providerConfirmedTools: string[]
  requiredExternalEffects?: Array<'gmail_send' | 'calendar_write' | 'application_submission'>
}

export function openAIToolName(toolName: string) {
  return toolName.replaceAll('.', '__')
}

export function internalAgentToolName(openAIName: string) {
  return openAIName.replaceAll('__', '.')
}

function strictSchemaCompatible(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(strictSchemaCompatible)
  if (!value || typeof value !== 'object') return true
  const schema = value as Record<string, unknown>
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) return false
    const properties = schema.properties && typeof schema.properties === 'object'
      ? Object.keys(schema.properties as Record<string, unknown>)
      : []
    const required = Array.isArray(schema.required) ? schema.required.map(String) : []
    if (properties.some(name => !required.includes(name))) return false
  }
  return Object.values(schema).every(strictSchemaCompatible)
}

/**
 * Convert an internal definition to the Responses API wire shape.
 *
 * Strict function schemas require every object node to reject unknown keys and
 * require every declared property. Several application tools deliberately
 * carry open provider/domain payloads, so those definitions must remain
 * non-strict and rely on the existing server-side argument validator.
 */
export function openAIToolDefinition(tool: AgentToolDefinition) {
  return {
    ...tool,
    name: openAIToolName(tool.name),
    strict: tool.strict && strictSchemaCompatible(tool.parameters),
  }
}

const calendarWriteTools = new Set([
  'calendar.create_event',
  'calendar.update_event',
  'calendar.delete_event',
])

export function agentCompletionEvidenceSatisfied(
  evidence: AgentCompletionEvidence,
) {
  if (evidence.taskCompletionPolicy === 'prepared_result') {
    return evidence.preparedResult
  }
  if (evidence.taskCompletionPolicy === 'payment_handoff') {
    // The MVP deliberately stops at the user-controlled payment boundary.
    // A model assertion alone can never prove that a purchase happened.
    return false
  }
  if (!evidence.externalChangeConfirmed) return false

  const confirmedTools = new Set(evidence.providerConfirmedTools)
  if (evidence.requiredExternalEffects?.length) {
    return evidence.requiredExternalEffects.every(effect => effect === 'gmail_send'
      ? confirmedTools.has('gmail.send_message')
      : effect === 'application_submission'
        ? confirmedTools.has('application.submit') || confirmedTools.has('browser.submit')
        : [...calendarWriteTools].some(tool => confirmedTools.has(tool)))
  }
  if (evidence.capability === 'gmail') {
    return confirmedTools.has('gmail.send_message')
  }
  if (evidence.capability === 'scheduling') {
    return [...calendarWriteTools].some(tool => confirmedTools.has(tool))
  }
  if (evidence.capability === 'calendar') {
    return [...calendarWriteTools].some(tool => confirmedTools.has(tool))
  }
  return confirmedTools.has('browser.submit') || confirmedTools.has('application.submit')
}

const weekdayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

function validExecutionTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return value
  } catch {
    return 'UTC'
  }
}

function localDateInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function addDateDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function nextWeekday(value: string, targetWeekday: number) {
  const currentWeekday = new Date(`${value}T12:00:00Z`).getUTCDay()
  const distance = (targetWeekday - currentWeekday + 7) % 7 || 7
  return addDateDays(value, distance)
}

export function agentExecutionDateContext(
  objective: string,
  requestedTimezone: string,
  now = new Date(),
): AgentExecutionDateContext {
  const timezone = validExecutionTimezone(requestedTimezone)
  const localDate = localDateInTimezone(now, timezone)
  const normalized = objective.toLocaleLowerCase()
  const relativeDates: AgentExecutionDateContext['relative_dates'] = []

  if (/\bnext week\b/.test(normalized)) {
    const currentWeekday = new Date(`${localDate}T12:00:00Z`).getUTCDay()
    const daysUntilNextMonday = (8 - currentWeekday) % 7 || 7
    const startDate = addDateDays(localDate, daysUntilNextMonday)
    relativeDates.push({
      phrase: 'next week',
      start_date: startDate,
      end_date: addDateDays(startDate, 6),
    })
  }
  if (/\btomorrow\b/.test(normalized)) {
    relativeDates.push({ phrase: 'tomorrow', date: addDateDays(localDate, 1) })
  }
  if (/\btoday\b/.test(normalized)) {
    relativeDates.push({ phrase: 'today', date: localDate })
  }

  const nextDayMatch = normalized.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  let outboundDate = ''
  if (nextDayMatch?.[1]) {
    outboundDate = nextWeekday(localDate, weekdayIndexes[nextDayMatch[1]]!)
    relativeDates.push({
      phrase: `next ${nextDayMatch[1]}`,
      date: outboundDate,
    })
  }

  const returnDayMatch = normalized.match(
    /\breturn(?:ing)?(?:\s+on)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  if (returnDayMatch?.[1] && outboundDate) {
    relativeDates.push({
      phrase: `returning ${returnDayMatch[1]}`,
      date: nextWeekday(outboundDate, weekdayIndexes[returnDayMatch[1]]!),
    })
  }

  return {
    utc_time: now.toISOString(),
    timezone,
    local_date: localDate,
    relative_dates: relativeDates,
  }
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const stringValue = (description: string, maxLength = 500) => ({
  type: 'string',
  description,
  maxLength,
})

const nullableString = (description: string, maxLength = 500) => ({
  type: ['string', 'null'],
  description,
  maxLength,
})

export const agentToolDefinitions: AgentToolDefinition[] = [
  {
    type: 'function',
    name: 'application.record_opportunity',
    description: 'Persist one source-backed opportunity in the current David campaign. Use official citations and never mark an opportunity verified without an official or government source.',
    parameters: objectSchema({
      campaign_id: stringValue('Durable ApplicationCampaign ID.', 64),
      opportunity: { type: 'object', description: 'Normalized opportunity fields and fit evidence.', additionalProperties: true },
      citations: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 20 },
      idempotency_key: stringValue('Stable key for this official URL snapshot.', 300),
    }, ['campaign_id', 'opportunity', 'citations', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.create_case',
    description: 'Create or reuse one durable ApplicationCase after the user approves the shortlist. Every requirement must be explicit and source-backed.',
    parameters: objectSchema({
      campaign_id: stringValue('Durable ApplicationCampaign ID.', 64),
      opportunity_id: stringValue('Durable Opportunity ID.', 64),
      portal_account: { type: 'object', additionalProperties: true },
      requirements: { type: 'array', items: { type: 'object', additionalProperties: true }, minItems: 1, maxItems: 80 },
      deadlines: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 20 },
      next_action: stringValue('The next safe action for this case.', 500),
      idempotency_key: stringValue('Stable key for this case creation request.', 300),
    }, ['campaign_id', 'opportunity_id', 'portal_account', 'requirements', 'deadlines', 'next_action', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.record_contact',
    description: 'Persist one professor, admissions contact, referee, writer, editor, or programme administrator and attach it to the current application case. Recording a contact never sends a message.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      kind: { type: 'string', enum: ['professor', 'admissions', 'referee', 'writer', 'editor', 'administrator'] },
      name: stringValue('Contact name.', 500),
      email: nullableString('Contact email address.', 320),
      provider_contact_id: nullableString('Existing provider contact identifier.', 256),
      gmail_thread_id: nullableString('Existing Gmail thread identifier.', 256),
      last_provider_message_id: nullableString('Latest provider message identifier.', 256),
      consent_to_contact: { type: 'boolean', description: 'Whether the user has approved first contact with this person.' },
      data: { type: 'object', additionalProperties: true },
      idempotency_key: stringValue('Stable key for this contact record.', 300),
    }, ['application_case_id', 'kind', 'name', 'email', 'provider_contact_id', 'gmail_thread_id', 'last_provider_message_id', 'consent_to_contact', 'data', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.register_writer',
    description: 'Persist one user-provided writer or editor record for later application assignment selection. This never sends a message or makes a payment.',
    parameters: objectSchema({
      name: stringValue('Writer or editor name.', 240),
      email: stringValue('Writer or editor email.', 320),
      specialties: { type: 'array', items: stringValue('Specialty.', 160), maxItems: 20 },
      degree_fields: { type: 'array', items: stringValue('Degree or research field.', 160), maxItems: 20 },
      programme_familiarity: { type: 'array', items: stringValue('Programme type or institution familiarity.', 240), maxItems: 20 },
      price: { type: ['number', 'null'], minimum: 0 },
      price_currency: nullableString('ISO currency.', 3),
      turnaround_hours: { type: ['integer', 'null'], minimum: 1, maximum: 8760 },
      availability: { type: 'string', enum: ['available', 'busy', 'unavailable'] },
      quality_score: { type: ['number', 'null'], minimum: 0, maximum: 100 },
      reliability_score: { type: ['number', 'null'], minimum: 0, maximum: 100 },
      revision_rate: { type: ['number', 'null'], minimum: 0, maximum: 100 },
      idempotency_key: stringValue('Stable key for this writer record.', 300),
    }, ['name', 'email', 'specialties', 'degree_fields', 'programme_familiarity', 'price', 'price_currency', 'turnaround_hours', 'availability', 'quality_score', 'reliability_score', 'revision_rate', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.select_writer',
    description: 'Rank the user’s available writer records for one application case using specialty, degree field, programme familiarity, quality, reliability, revisions, and price. When replacing an unavailable writer, cancel the old assignment before creating the replacement assignment.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      specialty: stringValue('Required writing or editing specialty.', 240),
      degree_field: stringValue('Applicant degree or research field.', 240),
      programme: stringValue('Programme or institution context.', 500),
      maximum_price: { type: ['number', 'null'], minimum: 0 },
      replacement_assignment_id: nullableString('Existing assignment to cancel before creating a replacement.', 80),
      idempotency_key: stringValue('Stable key for this writer selection.', 300),
    }, ['application_case_id', 'specialty', 'degree_field', 'programme', 'maximum_price', 'replacement_assignment_id', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.update_requirement',
    description: 'Advance one explicit application requirement only after its source, artifact, or provider evidence is available. This never invents a completion state.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      requirement_id: stringValue('Durable requirement ID.', 64),
      status: { type: 'string', enum: ['unknown', 'verified', 'missing', 'in_progress', 'awaiting_user', 'awaiting_writer', 'awaiting_referee', 'awaiting_institution', 'ready', 'approved', 'submitted', 'rejected', 'waived', 'expired'] },
      linked_artifact_id: nullableString('ApplicationArtifact ID supporting this requirement.', 80),
      verification_evidence_ids: { type: 'array', items: stringValue('Evidence ID.', 120), maxItems: 30 },
      blocker_reason: nullableString('Why the requirement is blocked, if applicable.', 1_000),
      idempotency_key: stringValue('Stable key for this requirement update.', 300),
    }, ['application_case_id', 'requirement_id', 'status', 'linked_artifact_id', 'verification_evidence_ids', 'blocker_reason', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.record_portal_checkpoint',
    description: 'Persist a typed portal execution contract and read-after-write checkpoint after one meaningful, reversibly saved section. A non-final section save is preparatory and does not require final-submission approval. Never advance an ambiguous or unverified section, and never use this tool for final application submission.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      session_id: stringValue('Task-owned browser session ID.', 64),
      checkpoint: { type: 'object', additionalProperties: true },
      idempotency_key: stringValue('Stable key for this portal section checkpoint.', 300),
    }, ['application_case_id', 'session_id', 'checkpoint', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.record_evidence',
    description: 'Attach one immutable evidence record to an ApplicationCase, such as an official citation, saved-section screenshot, approval record, or submission confirmation.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      kind: { type: 'string', enum: ['official_requirement_source', 'programme_snapshot', 'sent_message', 'received_message', 'uploaded_file_verification', 'saved_section_screenshot', 'submission_confirmation', 'application_id', 'receipt', 'status_email', 'approval_record', 'otp_retrieval', 'calendar_event'] },
      source_url: nullableString('Evidence source URL.', 2000),
      provider: nullableString('Provider name.', 120),
      provider_message_id: nullableString('Provider message ID.', 256),
      provider_thread_id: nullableString('Provider thread ID.', 256),
      asset_id: nullableString('Private FileAsset ID.', 64),
      excerpt: nullableString('Short redacted evidence excerpt.', 2000),
      metadata: { type: 'object', additionalProperties: true },
      idempotency_key: stringValue('Stable key for this evidence record.', 300),
    }, ['application_case_id', 'kind', 'source_url', 'provider', 'provider_message_id', 'provider_thread_id', 'asset_id', 'excerpt', 'metadata', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.record_communication',
    description: 'Attach a redacted inbound or outbound provider message to the correct application case, classify it, and advance the case state. Never persist a password, OTP, or full message body.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      contact_id: nullableString('Durable application contact ID.', 64),
      provider: stringValue('Provider name.', 120),
      provider_message_id: nullableString('Provider message ID.', 256),
      provider_thread_id: nullableString('Provider thread ID.', 256),
      direction: { type: 'string', enum: ['inbound', 'outbound'] },
      subject: stringValue('Message subject used for classification.', 998),
      excerpt: nullableString('Short redacted excerpt; do not include the full body or verification code.', 2_000),
      classification: nullableString('Optional known application reply classification.', 80),
      data: { type: 'object', additionalProperties: true },
      idempotency_key: stringValue('Stable key for this communication record.', 300),
    }, ['application_case_id', 'contact_id', 'provider', 'provider_message_id', 'provider_thread_id', 'direction', 'subject', 'excerpt', 'classification', 'data', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.create_human_assignment',
    description: 'Create a durable writer or editor assignment with a factual brief, source materials, deadline, and review expectations. Roon handles the email communication.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      writer_id: stringValue('Writer or editor record identifier.', 160),
      specialty: stringValue('Writer specialty.', 240),
      deliverable: stringValue('Exact document deliverable.', 500),
      brief: stringValue('Detailed assignment brief with factual constraints.', 12000),
      source_material_ids: { type: 'array', items: stringValue('Private source asset or evidence ID.', 120), maxItems: 80 },
      deadline_at: nullableString('ISO deadline.', 80),
      deadline_timezone: nullableString('IANA timezone.', 120),
      price: { type: ['number', 'null'], minimum: 0 },
      price_currency: nullableString('ISO currency.', 3),
      idempotency_key: stringValue('Stable key for this assignment.', 300),
    }, ['application_case_id', 'writer_id', 'specialty', 'deliverable', 'brief', 'source_material_ids', 'deadline_at', 'deadline_timezone', 'price', 'price_currency', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.build_referee_support_pack',
    description: 'Build and persist a source-linked referee support pack for one application. This prepares the referee workflow; first contact remains approval-gated through Roon.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      referee: { type: 'object', additionalProperties: true },
      applicant_asset_ids: { type: 'array', items: stringValue('Private applicant asset ID.', 120), maxItems: 40 },
      relationship_context: stringValue('How the referee knows the applicant.', 4_000),
      relevant_achievements: { type: 'array', items: stringValue('Grounded achievement.', 1_000), maxItems: 30 },
      suggested_evidence: { type: 'array', items: stringValue('Evidence suggestion.', 1_000), maxItems: 30 },
      recommendation_draft: nullableString('Optional clearly labelled rough draft.', 12_000),
      idempotency_key: stringValue('Stable key for this support pack.', 300),
    }, ['application_case_id', 'referee', 'applicant_asset_ids', 'relationship_context', 'relevant_achievements', 'suggested_evidence', 'recommendation_draft', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.build_readiness_report',
    description: 'Build and persist the deterministic final application readiness report. This never submits; it only prepares the exact package for user approval.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      referee_status: { type: 'array', items: stringValue('Current referee status.', 500), maxItems: 20 },
      declarations: { type: 'array', items: stringValue('Declaration that will appear in the portal.', 1000), maxItems: 20 },
      portal_validation_state: { type: 'array', items: stringValue('Read-after-write portal validation result.', 500), maxItems: 30 },
    }, ['application_case_id', 'referee_status', 'declarations', 'portal_validation_state']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.generate_document',
    description: 'Create a private derived PDF application document from authorised applicant context. Never invent facts.',
    parameters: objectSchema({
      title: stringValue('Document title.', 300),
      filename: stringValue('Safe PDF filename.', 255),
      body: stringValue('Grounded document text.', 30000),
      original_asset_id: nullableString('Reusable source FileAsset ID, or null for a new statement.', 64),
      word_limit: { type: ['integer', 'null'], minimum: 1, maximum: 10000 },
      character_limit: { type: ['integer', 'null'], minimum: 1, maximum: 50000 },
    }, ['title', 'filename', 'body', 'original_asset_id', 'word_limit', 'character_limit']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.generate_cv',
    description: 'Render a programme-specific CV from confirmed structured facts using the immutable graduate_application_cv_v1 template. The renderer, not the model, owns all LaTeX commands.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      filename: stringValue('Safe final PDF filename.', 255),
      page_target: { type: 'string', enum: ['one_page', 'two_page', 'academic'] },
      section_order: { type: 'array', items: stringValue('Structured CV section name.', 80), maxItems: 20 },
      cv_data: { type: 'object', additionalProperties: true, description: 'Structured CV content. Every rendered item must include confirmed provenance.' },
      meta_prompt_version: stringValue('Version of the programme-specific selection prompt.', 80),
      idempotency_key: stringValue('Stable key for this CV version.', 300),
    }, ['application_case_id', 'filename', 'page_target', 'section_order', 'cv_data', 'meta_prompt_version', 'idempotency_key']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.submit',
    description: 'Submit one application through the verified portal session after a deterministic readiness report and exact user approval. This action is never available to Roon or Caspian and is idempotent per application case.',
    parameters: objectSchema({
      application_case_id: stringValue('Durable ApplicationCase ID.', 64),
      session_id: stringValue('Verified task-owned browser session ID.', 64),
      target: stringValue('Exact final submission target observed in the portal.', 1000),
      expected_effect: stringValue('The exact application submission effect the user approved.', 1200),
      portal_checkpoint_id: stringValue('Latest verified portal checkpoint ID.', 64),
      package_checksum: stringValue('Checksum of the approved submission package.', 128),
    }, ['application_case_id', 'session_id', 'target', 'expected_effect', 'portal_checkpoint_id', 'package_checksum']),
    strict: true,
  },
  {
    type: 'function',
    name: 'application.request_roon',
    description: 'Create a typed, durable request for Roon to send or monitor application email, resolve a contact, schedule an interview, or retrieve an email verification code. Never perform Gmail or Calendar work directly as David.',
    parameters: {
      type: 'object',
      properties: {
        application_case_id: stringValue('Durable ApplicationCase ID.', 64),
        request_kind: { type: 'string', enum: ['create_draft', 'send_email', 'monitor_thread', 'resolve_contact', 'follow_up', 'read_application_reply', 'schedule_interview', 'schedule_meeting', 'create_calendar_reminder', 'monitor_writer_deadline', 'monitor_referee_deadline', 'monitor_professor_reply', 'detect_application_messages', 'search_otp'] },
        payload: { type: 'object', additionalProperties: true, description: 'Typed request payload. Never include passwords, payment data, or a raw OTP.' },
        idempotency_key: stringValue('Stable request key for retries.', 300),
      },
      required: ['application_case_id', 'request_kind', 'payload', 'idempotency_key'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'agent.request_context',
    description: 'Pause and ask the user one concise question for genuinely missing information. For a calendar conflict, include up to three verified suggested_options the user can select.',
    parameters: objectSchema({
      question: stringValue('The single concise question shown to the user.', 400),
      missing_fields: {
        type: 'array',
        items: stringValue('A stable missing field name.', 80),
        maxItems: 6,
      },
      suggested_options: {
        type: 'array',
        items: objectSchema({
          label: stringValue('Human-readable option, including date, time, and timezone.', 240),
          value: stringValue('Exact instruction to continue with this option.', 400),
        }, ['label', 'value']),
        maxItems: 3,
      },
    }, ['question', 'missing_fields', 'suggested_options']),
    strict: true,
  },
  {
    type: 'function',
    name: 'agent.complete',
    description: 'Complete only when the task completion policy is satisfied by verified tool results.',
    parameters: objectSchema({
      summary: stringValue('Concise user-visible outcome summary.', 1200),
      sections: {
        type: 'array',
        items: objectSchema({
          title: stringValue('Section title.', 120),
          body: stringValue('Section content.', 4000),
        }, ['title', 'body']),
        maxItems: 8,
      },
      drafts: {
        type: 'array',
        items: objectSchema({
          title: stringValue('Draft title.', 160),
          body: stringValue('Draft body.', 12000),
        }, ['title', 'body']),
        maxItems: 20,
      },
      follow_ups: {
        type: 'array',
        items: stringValue('A short follow-up task.', 300),
        maxItems: 8,
      },
      sources: {
        type: 'array',
        items: objectSchema({
          title: stringValue('Source title.', 300),
          url: stringValue('HTTP or HTTPS source URL.', 2000),
        }, ['title', 'url']),
        maxItems: 20,
      },
      prepared_result: { type: 'boolean' },
      external_change_confirmed: { type: 'boolean' },
      payment_boundary_reached: { type: 'boolean' },
      purchase_confirmed: { type: 'boolean' },
    }, [
      'summary',
      'sections',
      'drafts',
      'follow_ups',
      'sources',
      'prepared_result',
      'external_change_confirmed',
      'payment_boundary_reached',
      'purchase_confirmed',
    ]),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.search_messages',
    description: 'Search only the connected user’s Gmail with a bounded Gmail query.',
    parameters: objectSchema({
      query: stringValue('Gmail search query scoped to the objective.', 500),
      max_results: { type: 'integer', minimum: 1, maximum: 50 },
    }, ['query', 'max_results']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.read_message',
    description: 'Read one Gmail message already identified by a search or thread result.',
    parameters: objectSchema({
      message_id: stringValue('Google Gmail message ID.', 256),
    }, ['message_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.read_thread',
    description: 'Read one Gmail thread already identified as relevant to the objective.',
    parameters: objectSchema({
      thread_id: stringValue('Google Gmail thread ID.', 256),
    }, ['thread_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.create_draft',
    description: 'Prepare a private Gmail draft. This does not send the message.',
    parameters: objectSchema({
      to: {
        type: 'array',
        items: stringValue('Recipient email address.', 320),
        minItems: 1,
        maxItems: 20,
      },
      cc: { type: 'array', items: stringValue('CC recipient email address.', 320), maxItems: 20 },
      bcc: { type: 'array', items: stringValue('BCC recipient email address.', 320), maxItems: 20 },
      subject: stringValue('Email subject.', 998),
      body_text: stringValue('Plain-text email body.', 30000),
      thread_id: nullableString('Existing Gmail thread ID when replying.', 256),
      in_reply_to_message_id: nullableString('Existing Gmail message ID when replying.', 256),
    }, ['to', 'cc', 'bcc', 'subject', 'body_text', 'thread_id', 'in_reply_to_message_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.send_message',
    description: 'Send one exact approved Gmail draft. Requires a pending user approval.',
    parameters: objectSchema({
      draft_id: stringValue('The Gmail draft ID created by gmail.create_draft.', 256),
      expected_to: {
        type: 'array',
        items: stringValue('Approved recipient email address.', 320),
        minItems: 1,
        maxItems: 20,
      },
      expected_cc: { type: 'array', items: stringValue('Approved CC recipient email address.', 320), maxItems: 20 },
      expected_bcc: { type: 'array', items: stringValue('Approved BCC recipient email address.', 320), maxItems: 20 },
      expected_subject: stringValue('Approved email subject.', 998),
    }, ['draft_id', 'expected_to', 'expected_cc', 'expected_bcc', 'expected_subject']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.wait_for_reply',
    description: 'Pause this same AgentRun until a new reply arrives after the specified sent message in a Gmail thread. Use a contact email only when one specific respondent is awaited; otherwise use null for a multi-attendee negotiation.',
    parameters: objectSchema({
      thread_id: stringValue('Gmail thread ID returned after sending.', 256),
      sent_message_id: stringValue('Gmail message ID of the message ShotCount sent.', 256),
      contact_email: nullableString('Expected respondent email address when known.', 320),
      timeout_days: { type: 'integer', minimum: 1, maximum: 30 },
    }, ['thread_id', 'sent_message_id', 'contact_email', 'timeout_days']),
    strict: true,
  },
  {
    type: 'function',
    name: 'contacts.find_contact',
    description: 'Resolve a person from the connected user’s Google contacts and recent relevant correspondence.',
    parameters: objectSchema({
      query: stringValue('Name or email fragment from the user’s task.', 300),
      max_results: { type: 'integer', minimum: 1, maximum: 10 },
    }, ['query', 'max_results']),
    strict: true,
  },
  {
    type: 'function',
    name: 'contacts.resolve_recipient',
    description: 'Deterministically resolve one named email recipient before drafting. It checks Contacts first, then only Gmail From/To headers and Sent history. It returns explicit, resolved_single, ambiguous, not_found, or provider_unavailable; never guess when ambiguous.',
    parameters: objectSchema({
      recipient: stringValue('The person name or explicit email address from the user’s task.', 300),
    }, ['recipient']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.list_events',
    description: 'List connected calendar events in a bounded time window.',
    parameters: objectSchema({
      time_min: stringValue('Inclusive ISO 8601 start timestamp.', 64),
      time_max: stringValue('Exclusive ISO 8601 end timestamp.', 64),
      calendar_id: stringValue('Calendar ID, usually primary.', 320),
      max_results: { type: 'integer', minimum: 1, maximum: 250 },
    }, ['time_min', 'time_max', 'calendar_id', 'max_results']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.get_availability',
    description: 'Check free/busy information for a bounded set of calendars and time window.',
    parameters: objectSchema({
      time_min: stringValue('Inclusive ISO 8601 start timestamp.', 64),
      time_max: stringValue('Exclusive ISO 8601 end timestamp.', 64),
      calendar_ids: {
        type: 'array',
        items: stringValue('Calendar ID.', 320),
        minItems: 1,
        maxItems: 20,
      },
      timezone: stringValue('IANA timezone.', 120),
    }, ['time_min', 'time_max', 'calendar_ids', 'timezone']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.create_event',
    description: 'Create one exact approved calendar event. Set notify_attendees true only when the user explicitly wants attendee invitations or notifications.',
    parameters: objectSchema({
      calendar_id: stringValue('Calendar ID, usually primary.', 320),
      summary: stringValue('Event title.', 1000),
      description: stringValue('Event description.', 12000),
      start: stringValue('ISO 8601 start timestamp.', 64),
      end: stringValue('ISO 8601 end timestamp.', 64),
      timezone: stringValue('IANA timezone.', 120),
      attendee_emails: {
        type: 'array',
        items: stringValue('Attendee email address.', 320),
        maxItems: 50,
      },
      add_google_meet: { type: 'boolean' },
      notify_attendees: { type: 'boolean' },
    }, ['calendar_id', 'summary', 'description', 'start', 'end', 'timezone', 'attendee_emails', 'add_google_meet', 'notify_attendees']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.update_event',
    description: 'Apply an exact approved patch to an existing calendar event. Set notify_attendees true only when the user explicitly wants attendees notified.',
    parameters: objectSchema({
      calendar_id: stringValue('Calendar ID.', 320),
      event_id: stringValue('Google Calendar event ID.', 256),
      summary: nullableString('Replacement title.', 1000),
      description: nullableString('Replacement description.', 12000),
      start: nullableString('Replacement ISO 8601 start timestamp.', 64),
      end: nullableString('Replacement ISO 8601 end timestamp.', 64),
      timezone: nullableString('IANA timezone.', 120),
      notify_attendees: { type: 'boolean' },
    }, ['calendar_id', 'event_id', 'summary', 'description', 'start', 'end', 'timezone', 'notify_attendees']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.delete_event',
    description: 'Cancel one exact approved calendar event. Set notify_attendees true only when the user explicitly wants cancellation notices; otherwise set it false.',
    parameters: objectSchema({
      calendar_id: stringValue('Calendar ID.', 320),
      event_id: stringValue('Google Calendar event ID.', 256),
      notify_attendees: { type: 'boolean' },
    }, ['calendar_id', 'event_id', 'notify_attendees']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.start_session',
    description: 'Start an isolated, task-owned browser session for an allowed domain.',
    parameters: objectSchema({
      objective: stringValue('Browser sub-objective.', 1200),
      allowed_domains: {
        type: 'array',
        items: stringValue('Allowed hostname without scheme or path.', 253),
        minItems: 1,
        maxItems: 10,
      },
    }, ['objective', 'allowed_domains']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.navigate',
    description: 'Navigate the task-owned session to an HTTPS URL on its domain allowlist.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      url: stringValue('HTTPS URL on an allowed domain.', 2000),
    }, ['session_id', 'url']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.search_flights',
    description: 'Run a live, bounded one-way or round-trip flight search in the task-owned browser session.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      origin_code: stringValue('Three-letter IATA origin code.', 3),
      destination_code: stringValue('Three-letter IATA destination or city code.', 3),
      departure_date: stringValue('Outbound date in YYYY-MM-DD format.', 10),
      return_date: nullableString('Return date in YYYY-MM-DD format, or null for one-way travel.', 10),
      cabin: {
        type: 'string',
        enum: ['economy', 'premium_economy', 'business', 'first'],
      },
      max_stops: { type: 'integer', minimum: 0, maximum: 3 },
      budget_amount: {
        type: ['number', 'null'],
        minimum: 0,
        maximum: 1_000_000,
      },
      currency: {
        type: 'string',
        enum: ['USD', 'GBP', 'EUR', 'NGN'],
      },
      preferred_airlines: {
        type: 'array',
        items: stringValue('Optional preferred airline.', 120),
        maxItems: 10,
      },
      excluded_airlines: {
        type: 'array',
        items: stringValue('Airline to exclude from the results.', 120),
        maxItems: 10,
      },
      adults: { type: 'integer', minimum: 1, maximum: 9 },
      children: { type: 'integer', minimum: 0, maximum: 8 },
      children_ages: {
        type: 'array',
        items: { type: 'integer', minimum: 2, maximum: 11 },
        minItems: 0,
        maxItems: 8,
      },
      infants: { type: 'integer', minimum: 0, maximum: 4 },
      infant_seats: { type: 'integer', minimum: 0, maximum: 4 },
      allow_nearby_airports: { type: 'boolean' },
      departure_time_window: nullableString('Optional local departure time window, HH:MM-HH:MM.', 11),
      arrival_time_window: nullableString('Optional local arrival time window, HH:MM-HH:MM.', 11),
    }, [
      'session_id',
      'origin_code',
      'destination_code',
      'departure_date',
      'return_date',
      'cabin',
      'max_stops',
      'budget_amount',
      'currency',
      'preferred_airlines',
      'excluded_airlines',
      'adults',
      'children',
      'children_ages',
      'infants',
      'infant_seats',
      'allow_nearby_airports',
      'departure_time_window',
      'arrival_time_window',
    ]),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.select_flight',
    description: 'Resume the task-owned flight session with one exact option returned by browser.search_flights.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      option_id: stringValue('Exact option ID returned by the live search.', 128),
    }, ['session_id', 'option_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.prepare_flight_checkout',
    description: 'Fill the observed airline traveler and contact-information pages for the selected flight, advance only through safe review/payment handoff controls, and stop before any card or purchase action. Never provide payment details to this tool.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      travelers: {
        type: 'array',
        minItems: 1,
        maxItems: 9,
        items: objectSchema({
          traveler_type: { type: 'string', enum: ['adult', 'child', 'infant'] },
          title: nullableString('Passenger title or salutation, or null when not supplied.', 30),
          given_name: stringValue('Legal given/first name exactly as on the travel document.', 80),
          middle_name: nullableString('Legal middle name, or null.', 80),
          family_name: stringValue('Legal family/surname exactly as on the travel document.', 80),
          date_of_birth: stringValue('Date of birth in YYYY-MM-DD format.', 10),
          gender: nullableString('Gender/sex when required by the provider, or null.', 40),
          nationality: nullableString('Nationality/citizenship when supplied, or null.', 80),
          residence_country: nullableString('Country of residence when supplied, or null.', 80),
          document_type: { type: ['string', 'null'], description: 'passport, national_id, or null when the provider does not require a document yet.' },
          document_number: nullableString('Passport or national ID number, or null until required.', 80),
          document_issuing_country: nullableString('Document issuing country, or null.', 80),
          document_expiry: nullableString('Document expiry date in YYYY-MM-DD format, or null.', 10),
        }, [
          'traveler_type', 'title', 'given_name', 'middle_name', 'family_name',
          'date_of_birth', 'gender', 'nationality', 'residence_country',
          'document_type', 'document_number', 'document_issuing_country', 'document_expiry',
        ]),
      },
      contact_email: stringValue('Contact email for the booking provider.', 320),
      contact_phone: stringValue('Contact phone number for the booking provider.', 80),
    }, ['session_id', 'travelers', 'contact_email', 'contact_phone']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.observe',
    description: 'Read the current task-owned browser page state.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
    }, ['session_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.act',
    description: 'Perform a safe preparatory action in the task-owned browser session. This tool fills fields and activates safe navigation links, but it does not activate form save or submit controls.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      action: {
        type: 'string',
        enum: ['click', 'type', 'select', 'upload', 'scroll', 'wait'],
      },
      target: stringValue('Stable locator or concise visual target.', 1000),
      value: nullableString('Value for type/select actions.', 5000),
    }, ['session_id', 'action', 'target', 'value']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.submit',
    description: 'Submit an exact approved browser form before any financial boundary.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      target: stringValue('Exact submission target.', 1000),
      expected_effect: stringValue('Externally visible effect the user approved.', 1200),
    }, ['session_id', 'target', 'expected_effect']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.purchase',
    description: 'Financial purchase boundary. ShotCount must never execute this tool.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
    }, ['session_id']),
    strict: true,
  },
]

const policies: Record<string, ToolPolicy> = {
  'agent.request_context': { risk: 'read', approvalKind: null },
  'agent.complete': { risk: 'read', approvalKind: null },
  'application.record_opportunity': { risk: 'prepare', approvalKind: null },
  'application.create_case': { risk: 'prepare', approvalKind: null },
  'application.record_contact': { risk: 'prepare', approvalKind: null },
  'application.register_writer': { risk: 'prepare', approvalKind: null },
  'application.select_writer': { risk: 'read', approvalKind: null },
  'application.update_requirement': { risk: 'prepare', approvalKind: null },
  'application.record_portal_checkpoint': { risk: 'prepare', approvalKind: null },
  'application.record_evidence': { risk: 'prepare', approvalKind: null },
  'application.record_communication': { risk: 'prepare', approvalKind: null },
  'application.create_human_assignment': { risk: 'prepare', approvalKind: null },
  'application.build_referee_support_pack': { risk: 'prepare', approvalKind: null },
  'application.build_readiness_report': { risk: 'prepare', approvalKind: null },
  'application.generate_document': { risk: 'prepare', approvalKind: null },
  'application.generate_cv': { risk: 'prepare', approvalKind: null },
  'application.submit': { risk: 'external_write', approvalKind: 'browser_submit' },
  'application.request_roon': { risk: 'prepare', approvalKind: null },
  'gmail.search_messages': { risk: 'read', approvalKind: null },
  'gmail.read_message': { risk: 'read', approvalKind: null },
  'gmail.read_thread': { risk: 'read', approvalKind: null },
  'gmail.create_draft': { risk: 'prepare', approvalKind: null },
  'gmail.send_message': { risk: 'external_write', approvalKind: 'send_email' },
  'gmail.wait_for_reply': { risk: 'read', approvalKind: null },
  'contacts.find_contact': { risk: 'read', approvalKind: null },
  'contacts.resolve_recipient': { risk: 'read', approvalKind: null },
  'calendar.list_events': { risk: 'read', approvalKind: null },
  'calendar.get_availability': { risk: 'read', approvalKind: null },
  'calendar.create_event': { risk: 'external_write', approvalKind: 'calendar_write' },
  'calendar.update_event': { risk: 'external_write', approvalKind: 'calendar_write' },
  'calendar.delete_event': { risk: 'external_write', approvalKind: 'calendar_write' },
  'browser.start_session': { risk: 'read', approvalKind: null },
  'browser.navigate': { risk: 'read', approvalKind: null },
  'browser.search_flights': { risk: 'read', approvalKind: null },
  'browser.select_flight': { risk: 'prepare', approvalKind: null },
  'browser.prepare_flight_checkout': { risk: 'prepare', approvalKind: null },
  'browser.observe': { risk: 'read', approvalKind: null },
  'browser.act': { risk: 'prepare', approvalKind: null },
  'browser.submit': { risk: 'external_write', approvalKind: 'browser_submit' },
  'browser.purchase': { risk: 'financial', approvalKind: null },
}

export function policyForAgentTool(toolName: string): ToolPolicy {
  return policies[toolName] ?? { risk: 'financial', approvalKind: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateHttpUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function validateEmail(value: unknown) {
  return typeof value === 'string' &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validateIso(value: unknown) {
  return typeof value === 'string' &&
    value.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value) &&
    !Number.isNaN(Date.parse(value))
}

function validateAbsoluteIso(value: unknown) {
  return validateIso(value) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(String(value))
}

function validateIanaTimezone(value: unknown) {
  if (!validateString(value, 120)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: String(value) }).format()
    return true
  } catch {
    return false
  }
}

function validateRecipientBuckets(to: unknown, cc: unknown, bcc: unknown) {
  const values = [to, cc, bcc].flatMap(value => Array.isArray(value) ? value : [])
    .map(value => typeof value === 'string' ? value.toLocaleLowerCase() : '')
  return new Set(values).size === values.length
}

function validateDateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
}

function validatePastDateOnly(value: unknown) {
  return validateDateOnly(value) && String(value) <= new Date().toISOString().slice(0, 10)
}

function validatePhone(value: unknown) {
  if (typeof value !== 'string') return false
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 &&
    digits.length <= 20 &&
    /^\+?[0-9().\s-]+$/.test(value)
}

function validateTimeWindow(value: unknown) {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const match = value.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (!match) return false
  return [Number(match[1]), Number(match[3])].every(hour => hour >= 0 && hour <= 23) &&
    [Number(match[2]), Number(match[4])].every(minute => minute >= 0 && minute <= 59)
}

function validateString(value: unknown, maximum: number, allowEmpty = false) {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0)
}

function validateStringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  minimumItems = 0,
) {
  return Array.isArray(value) &&
    value.length >= minimumItems &&
    value.length <= maximumItems &&
    value.every(item => validateString(item, maximumLength))
}

export function validateAgentToolArguments(toolName: string, value: unknown) {
  if (!isRecord(value)) return false
  switch (toolName) {
    case 'application.record_opportunity':
      return validateString(value.campaign_id, 64) && isRecord(value.opportunity) &&
        Array.isArray(value.citations) && value.citations.length <= 20 && value.citations.every(isRecord) &&
        validateString(value.idempotency_key, 300)
    case 'application.create_case':
      return validateString(value.campaign_id, 64) &&
        validateString(value.opportunity_id, 64) &&
        isRecord(value.portal_account) &&
        Array.isArray(value.requirements) && value.requirements.length >= 1 && value.requirements.length <= 80 && value.requirements.every(isRecord) &&
        Array.isArray(value.deadlines) && value.deadlines.length <= 20 && value.deadlines.every(isRecord) &&
        validateString(value.next_action, 500, true) && validateString(value.idempotency_key, 300)
    case 'application.record_contact':
      return validateString(value.application_case_id, 64) &&
        ['professor', 'admissions', 'referee', 'writer', 'editor', 'administrator'].includes(String(value.kind)) &&
        validateString(value.name, 500) &&
        (value.email === null || validateString(value.email, 320)) &&
        (value.provider_contact_id === null || validateString(value.provider_contact_id, 256)) &&
        (value.gmail_thread_id === null || validateString(value.gmail_thread_id, 256)) &&
        (value.last_provider_message_id === null || validateString(value.last_provider_message_id, 256)) &&
        typeof value.consent_to_contact === 'boolean' && isRecord(value.data) && validateString(value.idempotency_key, 300)
    case 'application.register_writer':
      return validateString(value.name, 240) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email)) &&
        validateStringArray(value.specialties, 20, 160) && validateStringArray(value.degree_fields, 20, 160) &&
        validateStringArray(value.programme_familiarity, 20, 240) &&
        (value.price === null || (typeof value.price === 'number' && Number.isFinite(value.price) && value.price >= 0)) &&
        (value.price_currency === null || validateString(value.price_currency, 3)) &&
        (value.turnaround_hours === null || (Number.isInteger(value.turnaround_hours) && Number(value.turnaround_hours) >= 1 && Number(value.turnaround_hours) <= 8760)) &&
        ['available', 'busy', 'unavailable'].includes(String(value.availability)) &&
        (value.quality_score === null || (typeof value.quality_score === 'number' && Number.isFinite(value.quality_score) && value.quality_score >= 0 && value.quality_score <= 100)) &&
        (value.reliability_score === null || (typeof value.reliability_score === 'number' && Number.isFinite(value.reliability_score) && value.reliability_score >= 0 && value.reliability_score <= 100)) &&
        (value.revision_rate === null || (typeof value.revision_rate === 'number' && Number.isFinite(value.revision_rate) && value.revision_rate >= 0 && value.revision_rate <= 100)) &&
        validateString(value.idempotency_key, 300)
    case 'application.select_writer':
      return validateString(value.application_case_id, 64) && validateString(value.specialty, 240, true) &&
        validateString(value.degree_field, 240, true) && validateString(value.programme, 500, true) &&
        (value.maximum_price === null || (typeof value.maximum_price === 'number' && Number.isFinite(value.maximum_price) && value.maximum_price >= 0)) &&
        validateString(value.idempotency_key, 300)
    case 'application.update_requirement':
      return validateString(value.application_case_id, 64) && validateString(value.requirement_id, 64) &&
        ['unknown', 'verified', 'missing', 'in_progress', 'awaiting_user', 'awaiting_writer', 'awaiting_referee', 'awaiting_institution', 'ready', 'approved', 'submitted', 'rejected', 'waived', 'expired'].includes(String(value.status)) &&
        (value.linked_artifact_id === null || validateString(value.linked_artifact_id, 80)) &&
        validateStringArray(value.verification_evidence_ids, 30, 120) &&
        (value.blocker_reason === null || validateString(value.blocker_reason, 1000)) &&
        validateString(value.idempotency_key, 300)
    case 'application.record_portal_checkpoint':
      return validateString(value.application_case_id, 64) && validateString(value.session_id, 64) && isRecord(value.checkpoint) && validateString(value.idempotency_key, 300)
    case 'application.record_evidence':
      return validateString(value.application_case_id, 64) &&
        ['official_requirement_source', 'programme_snapshot', 'sent_message', 'received_message', 'uploaded_file_verification', 'saved_section_screenshot', 'submission_confirmation', 'application_id', 'receipt', 'status_email', 'approval_record', 'otp_retrieval', 'calendar_event'].includes(String(value.kind)) &&
        (value.source_url === null || validateHttpUrl(value.source_url)) &&
        (value.provider === null || validateString(value.provider, 120)) &&
        (value.provider_message_id === null || validateString(value.provider_message_id, 256)) &&
        (value.provider_thread_id === null || validateString(value.provider_thread_id, 256)) &&
        (value.asset_id === null || validateString(value.asset_id, 64)) &&
        (value.excerpt === null || validateString(value.excerpt, 2000)) &&
        isRecord(value.metadata) && validateString(value.idempotency_key, 300)
    case 'application.record_communication':
      return validateString(value.application_case_id, 64) &&
        (value.contact_id === null || validateString(value.contact_id, 64)) &&
        validateString(value.provider, 120) &&
        (value.provider_message_id === null || validateString(value.provider_message_id, 256)) &&
        (value.provider_thread_id === null || validateString(value.provider_thread_id, 256)) &&
        ['inbound', 'outbound'].includes(String(value.direction)) &&
        validateString(value.subject, 998, true) &&
        (value.excerpt === null || validateString(value.excerpt, 2000)) &&
        (value.classification === null || validateString(value.classification, 80)) &&
        isRecord(value.data) && validateString(value.idempotency_key, 300)
    case 'application.create_human_assignment':
      return validateString(value.application_case_id, 64) && validateString(value.writer_id, 160) &&
        validateString(value.specialty, 240, true) && validateString(value.deliverable, 500) && validateString(value.brief, 12000) &&
        validateStringArray(value.source_material_ids, 80, 120) &&
        (value.deadline_at === null || validateString(value.deadline_at, 80)) &&
        (value.deadline_timezone === null || validateString(value.deadline_timezone, 120)) &&
        (value.price === null || (typeof value.price === 'number' && Number.isFinite(value.price) && value.price >= 0)) &&
        (value.price_currency === null || validateString(value.price_currency, 3)) && validateString(value.idempotency_key, 300)
    case 'application.build_referee_support_pack':
      return validateString(value.application_case_id, 64) && isRecord(value.referee) &&
        validateStringArray(value.applicant_asset_ids, 40, 120) &&
        validateString(value.relationship_context, 4000, true) &&
        validateStringArray(value.relevant_achievements, 30, 1000) &&
        validateStringArray(value.suggested_evidence, 30, 1000) &&
        (value.recommendation_draft === null || validateString(value.recommendation_draft, 12000)) &&
        validateString(value.idempotency_key, 300)
    case 'application.build_readiness_report':
      return validateString(value.application_case_id, 64) && validateStringArray(value.referee_status, 20, 500) &&
        validateStringArray(value.declarations, 20, 1000) && validateStringArray(value.portal_validation_state, 30, 500)
    case 'agent.request_context':
      return validateString(value.question, 400) &&
        validateStringArray(value.missing_fields, 6, 80) &&
        Array.isArray(value.suggested_options) &&
        value.suggested_options.length <= 3 &&
        value.suggested_options.every(option => isRecord(option) && validateString(option.label, 240) && validateString(option.value, 400))
    case 'agent.complete':
      return validateString(value.summary, 1200) &&
        Array.isArray(value.sections) &&
        value.sections.length <= 8 &&
        value.sections.every(section =>
          isRecord(section) &&
          validateString(section.title, 120) &&
          validateString(section.body, 4000)
        ) &&
        Array.isArray(value.drafts) &&
        value.drafts.length <= 20 &&
        value.drafts.every(draft =>
          isRecord(draft) &&
          validateString(draft.title, 160) &&
          validateString(draft.body, 12000)
        ) &&
        Array.isArray(value.follow_ups) &&
        validateStringArray(value.follow_ups, 8, 300) &&
        Array.isArray(value.sources) &&
        value.sources.length <= 20 &&
        value.sources.every(source =>
          isRecord(source) &&
          validateString(source.title, 300) &&
          validateHttpUrl(source.url)
        ) &&
        typeof value.prepared_result === 'boolean' &&
        typeof value.external_change_confirmed === 'boolean' &&
        typeof value.payment_boundary_reached === 'boolean' &&
        typeof value.purchase_confirmed === 'boolean'
    case 'gmail.search_messages':
      return validateString(value.query, 500) &&
        Number.isInteger(value.max_results) &&
        Number(value.max_results) >= 1 &&
        Number(value.max_results) <= 50
    case 'gmail.read_message':
      return validateString(value.message_id, 256)
    case 'gmail.read_thread':
      return validateString(value.thread_id, 256)
    case 'gmail.create_draft':
      return Array.isArray(value.to) &&
        value.to.length >= 1 &&
        value.to.length <= 20 &&
        value.to.every(validateEmail) &&
        Array.isArray(value.cc) && value.cc.length <= 20 && value.cc.every(validateEmail) &&
        Array.isArray(value.bcc) && value.bcc.length <= 20 && value.bcc.every(validateEmail) &&
        validateRecipientBuckets(value.to, value.cc, value.bcc) &&
        validateString(value.subject, 998, true) &&
        validateString(value.body_text, 30000) &&
        (value.thread_id === null || validateString(value.thread_id, 256)) &&
        (value.in_reply_to_message_id === null || validateString(value.in_reply_to_message_id, 256)) &&
        ((value.thread_id === null) === (value.in_reply_to_message_id === null))
    case 'gmail.send_message':
      return validateString(value.draft_id, 256) &&
        Array.isArray(value.expected_to) &&
        value.expected_to.length >= 1 &&
        value.expected_to.length <= 20 &&
        value.expected_to.every(validateEmail) &&
        Array.isArray(value.expected_cc) && value.expected_cc.length <= 20 && value.expected_cc.every(validateEmail) &&
        Array.isArray(value.expected_bcc) && value.expected_bcc.length <= 20 && value.expected_bcc.every(validateEmail) &&
        validateRecipientBuckets(value.expected_to, value.expected_cc, value.expected_bcc) &&
        validateString(value.expected_subject, 998, true)
    case 'gmail.wait_for_reply':
      return validateString(value.thread_id, 256) &&
        validateString(value.sent_message_id, 256) &&
        (value.contact_email === null || validateEmail(value.contact_email)) &&
        Number.isInteger(value.timeout_days) &&
        Number(value.timeout_days) >= 1 &&
        Number(value.timeout_days) <= 30
    case 'contacts.find_contact':
      return validateString(value.query, 300) &&
        Number.isInteger(value.max_results) &&
        Number(value.max_results) >= 1 &&
        Number(value.max_results) <= 10
    case 'contacts.resolve_recipient':
      return validateString(value.recipient, 300)
    case 'calendar.list_events':
      return validateAbsoluteIso(value.time_min) &&
        validateAbsoluteIso(value.time_max) &&
        Date.parse(String(value.time_max)) > Date.parse(String(value.time_min)) &&
        validateString(value.calendar_id, 320) &&
        Number.isInteger(value.max_results) &&
        Number(value.max_results) >= 1 &&
        Number(value.max_results) <= 250
    case 'calendar.get_availability':
      return validateIso(value.time_min) &&
        validateIso(value.time_max) &&
        Date.parse(String(value.time_max)) > Date.parse(String(value.time_min)) &&
        validateStringArray(value.calendar_ids, 20, 320, 1) &&
        validateIanaTimezone(value.timezone)
    case 'calendar.create_event':
      return validateString(value.calendar_id, 320) &&
        validateString(value.summary, 1000) &&
        validateString(value.description, 12000, true) &&
        validateIso(value.start) &&
        validateIso(value.end) &&
        Date.parse(String(value.end)) > Date.parse(String(value.start)) &&
        validateIanaTimezone(value.timezone) &&
        Array.isArray(value.attendee_emails) &&
        value.attendee_emails.length <= 50 &&
        value.attendee_emails.every(validateEmail) &&
        typeof value.add_google_meet === 'boolean' &&
        typeof value.notify_attendees === 'boolean'
    case 'calendar.update_event':
      if (!(validateString(value.calendar_id, 320) &&
        validateString(value.event_id, 256) &&
        (value.summary === null || validateString(value.summary, 1000)) &&
        (value.description === null || validateString(value.description, 12000, true)) &&
        (value.start === null || validateIso(value.start)) &&
        (value.end === null || validateIso(value.end)) &&
        (value.timezone === null || validateIanaTimezone(value.timezone)) &&
        typeof value.notify_attendees === 'boolean')) return false
      return value.start === null ||
        value.end === null ||
        Date.parse(String(value.end)) > Date.parse(String(value.start))
    case 'calendar.delete_event':
      return validateString(value.calendar_id, 320) &&
        validateString(value.event_id, 256) &&
        typeof value.notify_attendees === 'boolean'
    case 'browser.start_session':
      return validateString(value.objective, 1200) &&
        validateStringArray(value.allowed_domains, 10, 253) &&
        (value.allowed_domains as string[]).length > 0 &&
        (value.allowed_domains as string[]).every(domain =>
          /^[a-z0-9.-]+$/i.test(domain) && !domain.includes('..')
        )
    case 'browser.navigate':
      return validateString(value.session_id, 64) && validateUrl(value.url)
    case 'browser.search_flights':
      return validateString(value.session_id, 64) &&
        /^[A-Z]{3}$/.test(String(value.origin_code)) &&
        /^[A-Z]{3}$/.test(String(value.destination_code)) &&
        value.origin_code !== value.destination_code &&
        validateDateOnly(value.departure_date) &&
        (value.return_date === null || (
          validateDateOnly(value.return_date) &&
          Date.parse(`${value.return_date}T00:00:00Z`) > Date.parse(`${value.departure_date}T00:00:00Z`)
        )) &&
        ['economy', 'premium_economy', 'business', 'first'].includes(String(value.cabin)) &&
        Number.isInteger(value.max_stops) &&
        Number(value.max_stops) >= 0 &&
        Number(value.max_stops) <= 3 &&
        (value.budget_amount === null ||
          (typeof value.budget_amount === 'number' &&
            Number.isFinite(value.budget_amount) &&
            value.budget_amount >= 0 &&
            value.budget_amount <= 1_000_000)) &&
        ['USD', 'GBP', 'EUR', 'NGN'].includes(String(value.currency)) &&
        validateStringArray(value.preferred_airlines, 10, 120) &&
        validateStringArray(value.excluded_airlines, 10, 120) &&
        Number.isInteger(value.adults) &&
        Number(value.adults) >= 1 &&
        Number(value.adults) <= 9 &&
        Number.isInteger(value.children) &&
        Number(value.children) >= 0 &&
        Number(value.children) <= 8 &&
        Array.isArray(value.children_ages) &&
        value.children_ages.length === Number(value.children) &&
        value.children_ages.every((age: unknown) => Number.isInteger(age) && Number(age) >= 2 && Number(age) <= 11) &&
        Number.isInteger(value.infants) &&
        Number(value.infants) >= 0 &&
        Number(value.infants) <= 4 &&
        Number(value.infants) <= Number(value.adults) &&
        Number.isInteger(value.infant_seats) &&
        Number(value.infant_seats) >= 0 &&
        Number(value.infant_seats) <= Number(value.infants) &&
        typeof value.allow_nearby_airports === 'boolean' &&
        validateTimeWindow(value.departure_time_window) &&
        validateTimeWindow(value.arrival_time_window)
    case 'browser.select_flight':
      return validateString(value.session_id, 64) &&
        /^[a-f0-9]{16,128}$/i.test(String(value.option_id))
    case 'browser.prepare_flight_checkout':
      if (Object.keys(value).some(key => /card|cvv|cvc|security|payment|billing|bank|password|otp/i.test(key))) return false
      return validateString(value.session_id, 64) &&
        Array.isArray(value.travelers) &&
        value.travelers.length >= 1 &&
        value.travelers.length <= 9 &&
        value.travelers.every((item: unknown) => {
          if (!isRecord(item)) return false
          const traveler = item as Record<string, unknown>
          if (Object.keys(traveler).some(key => /card|cvv|cvc|security|payment|billing|bank|password|otp/i.test(key))) return false
          const nullable = (candidate: unknown, maximum: number) => candidate === null || validateString(candidate, maximum)
          const documentType = traveler.document_type
          const documentNumber = traveler.document_number
          const documentIssuingCountry = traveler.document_issuing_country
          const documentExpiry = traveler.document_expiry
          const anyDocumentDetail = documentType !== null || documentNumber !== null || documentIssuingCountry !== null || documentExpiry !== null
          const completeDocument = documentType !== null &&
            validateString(documentNumber, 80) &&
            validateString(documentIssuingCountry, 80) &&
            validateDateOnly(documentExpiry)
          return ['adult', 'child', 'infant'].includes(String(traveler.traveler_type)) &&
            nullable(traveler.title, 30) &&
            validateString(traveler.given_name, 80) &&
            nullable(traveler.middle_name, 80) &&
            validateString(traveler.family_name, 80) &&
            validatePastDateOnly(traveler.date_of_birth) &&
            nullable(traveler.gender, 40) &&
            nullable(traveler.nationality, 80) &&
            nullable(traveler.residence_country, 80) &&
            (documentType === null || documentType === 'passport' || documentType === 'national_id') &&
            nullable(traveler.document_number, 80) &&
            nullable(traveler.document_issuing_country, 80) &&
            (traveler.document_expiry === null || validateDateOnly(traveler.document_expiry)) &&
            (!anyDocumentDetail || completeDocument)
        }) &&
        validateEmail(value.contact_email) &&
        validatePhone(value.contact_phone)
    case 'browser.observe':
    case 'browser.purchase':
      return validateString(value.session_id, 64)
    case 'browser.act':
      return validateString(value.session_id, 64) &&
        ['click', 'type', 'select', 'upload', 'scroll', 'wait'].includes(String(value.action)) &&
        validateString(value.target, 1000) &&
        (value.value === null || validateString(value.value, 5000, true))
    case 'browser.submit':
      return validateString(value.session_id, 64) &&
        validateString(value.target, 1000) &&
        validateString(value.expected_effect, 1200)
    case 'application.generate_document':
      return validateString(value.title, 300) &&
        validateString(value.filename, 255) &&
        /\.pdf$/i.test(String(value.filename)) &&
        validateString(value.body, 30000) &&
        (value.original_asset_id === null || /^[0-9a-f-]{36}$/i.test(String(value.original_asset_id))) &&
        (value.word_limit === null || (Number.isInteger(value.word_limit) && Number(value.word_limit) > 0)) &&
        (value.character_limit === null || (Number.isInteger(value.character_limit) && Number(value.character_limit) > 0))
    case 'application.generate_cv':
      return validateString(value.application_case_id, 64) &&
        validateString(value.filename, 255) &&
        /\.pdf$/i.test(String(value.filename)) &&
        ['one_page', 'two_page', 'academic'].includes(String(value.page_target)) &&
        validateStringArray(value.section_order, 20, 80) &&
        isRecord(value.cv_data) &&
        validateString(value.meta_prompt_version, 80) &&
        validateString(value.idempotency_key, 300)
    case 'application.submit':
      return validateString(value.application_case_id, 64) &&
        validateString(value.session_id, 64) &&
        validateString(value.target, 1000) &&
        validateString(value.expected_effect, 1200) &&
        validateString(value.portal_checkpoint_id, 64) &&
        validateString(value.package_checksum, 128)
    case 'application.request_roon':
      return validateString(value.application_case_id, 64) &&
        ['create_draft', 'send_email', 'monitor_thread', 'resolve_contact', 'follow_up', 'read_application_reply', 'schedule_interview', 'schedule_meeting', 'create_calendar_reminder', 'monitor_writer_deadline', 'monitor_referee_deadline', 'monitor_professor_reply', 'detect_application_messages', 'search_otp'].includes(String(value.request_kind)) &&
        isRecord(value.payload) &&
        validateString(value.idempotency_key, 300)
    default:
      return false
  }
}
