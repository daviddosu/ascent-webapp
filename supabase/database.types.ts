/**
 * Checked-in database contract for the David application execution migration.
 *
 * This is intentionally kept beside the migration so an Edge Function and the
 * signed-in client cannot silently drift on task/case/assignment identity.
 * Re-run the Supabase type generator after applying a newer migration and keep
 * the application tables below in the generated output.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: never[]
}

type ApplicationProfileRow = {
  id: string
  user_id: string
  schema_version: number
  profile: Json
  consent: Json
  consent_granted: boolean
  created_at: string
  updated_at: string
}

type ApplicationCampaignRow = {
  id: string
  user_id: string
  task_id: string
  owner_specialist_id: 'david'
  objective: string
  application_kind: string
  status: string
  data: Json
  target_quantity: number | null
  intake_year: number | null
  approved_strategy: Json | null
  next_action: string
  progress: Json
  created_at: string
  updated_at: string
}

type ApplicationOpportunityRow = {
  id: string
  campaign_id: string
  user_id: string
  institution: string
  programme_title: string
  official_url: string
  application_url: string | null
  deadline_at: string | null
  deadline_timezone: string | null
  verification_status: string
  confidence: number
  fit_score: number
  data: Json
  citations: Json
  retrieved_at: string
  recommendation_rationale: string
  created_at: string
  updated_at: string
}

type ApplicationCaseRow = {
  id: string
  campaign_id: string
  opportunity_id: string
  user_id: string
  task_id: string
  current_stage: string
  status: string
  portal_account: Json
  portal_session_id: string | null
  next_action: string
  data: Json
  application_id: string | null
  submission_attempt_key: string | null
  submitted_at: string | null
  final_outcome: string | null
  created_at: string
  updated_at: string
}

type ApplicationRequirementRow = {
  id: string
  application_case_id: string
  user_id: string
  name: string
  category: string
  required: boolean
  exact_instructions: string
  deadline_at: string | null
  deadline_timezone: string | null
  status: string
  responsible_party: string
  linked_artifact_id: string | null
  verification_evidence_ids: string[]
  source: Json | null
  blocker_reason: string | null
  created_at: string
  updated_at: string
}

type ApplicationArtifactRow = {
  id: string
  user_id: string
  file_asset_id: string
  application_case_id: string | null
  opportunity_id: string | null
  kind: string
  original_asset_ids: string[]
  template_version: string | null
  prompt_version: string | null
  author_type: string
  revision_of: string | null
  revision_history: Json
  checksum: string
  approval_status: string
  final_submission_destination: string | null
  metadata: Json
  created_at: string
}

type ApplicationContactRow = {
  id: string
  user_id: string
  application_case_id: string | null
  task_id: string | null
  campaign_id: string | null
  agent_run_id: string | null
  kind: string
  name: string
  email: string | null
  provider_contact_id: string | null
  gmail_thread_id: string | null
  last_provider_message_id: string | null
  consent_to_contact: boolean
  data: Json
  idempotency_key: string
  created_at: string
  updated_at: string
}

type ApplicationWriterRow = {
  id: string
  user_id: string
  name: string
  email: string
  specialties: string[]
  degree_fields: string[]
  programme_familiarity: string[]
  price: number | null
  price_currency: string | null
  turnaround_hours: number | null
  availability: 'available' | 'busy' | 'unavailable'
  quality_score: number | null
  reliability_score: number | null
  revision_rate: number | null
  active_assignments: number
  data: Json
  created_at: string
  updated_at: string
}

type HumanAssignmentRow = {
  id: string
  user_id: string
  application_case_id: string
  task_id: string | null
  campaign_id: string | null
  agent_run_id: string | null
  gmail_thread_id: string | null
  last_provider_message_id: string | null
  writer_id: string
  specialty: string
  deliverable: string
  brief: string
  source_material_ids: string[]
  deadline_at: string | null
  deadline_timezone: string | null
  price: number | null
  price_currency: string | null
  status: string
  questions: Json
  revisions: number
  quality_review: Json
  final_artifact_id: string | null
  payment_status: string
  sla_breaches: Json
  escalation_level: number
  idempotency_key: string
  created_at: string
  updated_at: string
}

type PortalCheckpointRow = {
  id: string
  user_id: string
  application_case_id: string
  portal: string
  account_identifier: string | null
  url: string
  section: string
  contract: Json
  entered_values: Json
  value_sources: Json
  uploaded_artifacts: string[]
  save_confirmation: string | null
  validation_errors: Json
  screenshots: string[]
  session_information: Json
  completion_signal: string | null
  next_step: string | null
  idempotency_key: string
  verified: boolean
  created_at: string
}

type ApplicationEvidenceRow = {
  id: string
  user_id: string
  application_case_id: string
  task_id: string | null
  campaign_id: string | null
  agent_run_id: string | null
  human_assignment_id: string | null
  kind: string
  source_url: string | null
  provider: string | null
  provider_message_id: string | null
  provider_thread_id: string | null
  asset_id: string | null
  excerpt: string | null
  metadata: Json
  idempotency_key: string
  captured_at: string
}

type ApplicationCommunicationRow = {
  id: string
  user_id: string
  application_case_id: string
  task_id: string | null
  campaign_id: string | null
  agent_run_id: string | null
  human_assignment_id: string | null
  contact_id: string | null
  provider: string
  provider_message_id: string | null
  provider_thread_id: string | null
  direction: 'inbound' | 'outbound'
  classification: string | null
  data: Json
  idempotency_key: string
  created_at: string
}

type ApplicationInterAgentRequestRow = {
  id: string
  user_id: string
  task_id: string
  agent_run_id: string
  application_case_id: string
  from_specialist_id: string
  to_specialist_id: string
  request_kind: string
  payload: Json
  idempotency_key: string
  status: string
  result: Json | null
  provider_action_id: string | null
  completion_evidence: Json
  attempt_count: number
  next_attempt_at: string | null
  last_error: Json | null
  human_assignment_id: string | null
  created_at: string
  updated_at: string
}

type ApplicationOtpEventRow = {
  id: string
  user_id: string
  application_case_id: string
  institution: string
  portal: string
  destination_email: string
  requested_at: string
  matched_message_id: string | null
  matched_thread_id: string | null
  matched_at: string | null
  code_hash: string | null
  idempotency_key: string
  created_at: string
}

type ApplicationSubmissionAttemptRow = {
  id: string
  user_id: string
  application_case_id: string
  idempotency_key: string
  status: string
  application_id: string | null
  evidence: Json
  created_at: string
  completed_at: string | null
}

type FileAssetRow = {
  id: string
  user_id: string
  task_id: string | null
  agent_run_id: string | null
  original_filename: string
  mime_type: string
  storage_key: string
  size_bytes: number
  checksum: string
  source: 'task_upload' | 'roon_generated' | 'roon_writer_reply' | 'institution_reply'
  reusable: boolean
  original_asset_id: string | null
  asset_kind: string
  application_case_id: string | null
  opportunity_id: string | null
  source_asset_ids: string[]
  template_version: string | null
  prompt_version: string | null
  author_type: string | null
  revision_history: Json
  approval_status: string
  final_submission_destination: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      applicant_profiles: Table<ApplicationProfileRow>
      application_campaigns: Table<ApplicationCampaignRow>
      application_opportunities: Table<ApplicationOpportunityRow>
      application_cases: Table<ApplicationCaseRow>
      application_requirements: Table<ApplicationRequirementRow>
      application_artifacts: Table<ApplicationArtifactRow>
      application_contacts: Table<ApplicationContactRow>
      application_writers: Table<ApplicationWriterRow>
      human_assignments: Table<HumanAssignmentRow>
      portal_checkpoints: Table<PortalCheckpointRow>
      application_evidence: Table<ApplicationEvidenceRow>
      application_communications: Table<ApplicationCommunicationRow>
      application_inter_agent_requests: Table<ApplicationInterAgentRequestRow>
      application_otp_events: Table<ApplicationOtpEventRow>
      application_submission_attempts: Table<ApplicationSubmissionAttemptRow>
      file_assets: Table<FileAssetRow>
    }
    Views: Record<string, never>
    Functions: {
      set_applicant_reuse_consent: { Args: { p_granted: boolean; p_scope: string | null }; Returns: ApplicationProfileRow }
      claim_application_submission: { Args: { p_user_id: string; p_case_id: string; p_idempotency_key: string }; Returns: Array<{ allowed: boolean; attempt_id: string | null; reason: string }> }
      record_application_submission: { Args: { p_attempt_id: string; p_application_id: string | null; p_evidence: Json }; Returns: ApplicationCaseRow }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
