export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accountability_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          invitee_email: string
          inviter_id: string
          status: string
          token: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invitee_email?: string
          inviter_id: string
          status?: string
          token: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invitee_email?: string
          inviter_id?: string
          status?: string
          token?: string
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          arguments: Json
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          failure_taxonomy: string | null
          id: string
          idempotency_key: string
          model_call_id: string | null
          output: Json | null
          provider_action_id: string | null
          public_summary: string
          recovery_attempt: number
          retryable: boolean
          risk: string
          run_id: string
          specialist_id: string | null
          specialist_version: string | null
          started_at: string | null
          status: string
          step_index: number
          task_contract: string | null
          tool_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arguments?: Json
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failure_taxonomy?: string | null
          id?: string
          idempotency_key: string
          model_call_id?: string | null
          output?: Json | null
          provider_action_id?: string | null
          public_summary?: string
          recovery_attempt?: number
          retryable?: boolean
          risk: string
          run_id: string
          specialist_id?: string | null
          specialist_version?: string | null
          started_at?: string | null
          status: string
          step_index: number
          task_contract?: string | null
          tool_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arguments?: Json
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failure_taxonomy?: string | null
          id?: string
          idempotency_key?: string
          model_call_id?: string | null
          output?: Json | null
          provider_action_id?: string | null
          public_summary?: string
          recovery_attempt?: number
          retryable?: boolean
          risk?: string
          run_id?: string
          specialist_id?: string | null
          specialist_version?: string | null
          started_at?: string | null
          status?: string
          step_index?: number
          task_contract?: string | null
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_approvals: {
        Row: {
          action_id: string
          created_at: string
          decided_at: string | null
          expires_at: string | null
          id: string
          kind: string
          payload: Json
          payload_hash: string
          run_id: string
          status: string
          summary: string
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          action_id: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          payload?: Json
          payload_hash: string
          run_id: string
          status?: string
          summary: string
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          action_id?: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          payload_hash?: string
          run_id?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_email_watches: {
        Row: {
          contact_email: string | null
          created_at: string
          expires_at: string
          id: string
          last_checked_at: string | null
          last_history_id: string | null
          matched_message_id: string | null
          next_poll_at: string
          run_id: string
          sent_message_id: string | null
          status: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_checked_at?: string | null
          last_history_id?: string | null
          matched_message_id?: string | null
          next_poll_at?: string
          run_id: string
          sent_message_id?: string | null
          status?: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_checked_at?: string | null
          last_history_id?: string | null
          matched_message_id?: string | null
          next_poll_at?: string
          run_id?: string
          sent_message_id?: string | null
          status?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_email_watches_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_integrations: {
        Row: {
          access_token_ciphertext: string
          account_email: string
          created_at: string
          id: string
          last_error: string
          last_refresh_at: string | null
          provider: string
          provider_user_id: string | null
          refresh_token_ciphertext: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext: string
          account_email?: string
          created_at?: string
          id?: string
          last_error?: string
          last_refresh_at?: string | null
          provider: string
          provider_user_id?: string | null
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string
          account_email?: string
          created_at?: string
          id?: string
          last_error?: string
          last_refresh_at?: string | null
          provider?: string
          provider_user_id?: string | null
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_model_state: {
        Row: {
          response_id: string | null
          response_items: Json
          run_id: string
          sequence_number: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          response_id?: string | null
          response_items?: Json
          run_id: string
          sequence_number?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          response_id?: string | null
          response_items?: Json
          run_id?: string
          sequence_number?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_model_state_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_oauth_states: {
        Row: {
          code_verifier_ciphertext: string
          created_at: string
          expires_at: string
          provider: string
          return_to: string
          state_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_verifier_ciphertext: string
          created_at?: string
          expires_at: string
          provider: string
          return_to: string
          state_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_verifier_ciphertext?: string
          created_at?: string
          expires_at?: string
          provider?: string
          return_to?: string
          state_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_run_events: {
        Row: {
          created_at: string
          event_type: string
          failure_taxonomy: string | null
          id: number
          message: string
          metadata: Json
          recovery_attempt: number
          run_id: string
          specialist_id: string | null
          specialist_version: string | null
          status: string
          task_contract: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          failure_taxonomy?: string | null
          id?: never
          message?: string
          metadata?: Json
          recovery_attempt?: number
          run_id: string
          specialist_id?: string | null
          specialist_version?: string | null
          status: string
          task_contract?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          failure_taxonomy?: string | null
          id?: never
          message?: string
          metadata?: Json
          recovery_attempt?: number
          run_id?: string
          specialist_id?: string | null
          specialist_version?: string | null
          status?: string
          task_contract?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_handoffs: {
        Row: {
          approval_state: string
          completed_effects: Json
          created_at: string
          from_specialist_id: string
          from_specialist_version: string
          from_stage_index: number
          id: string
          next_required_stage: Json | null
          objective: string
          provider_evidence: Json
          relevant_constraints: Json
          run_id: string
          task_id: string
          to_specialist_id: string
          to_specialist_version: string
          unsatisfied_effects: Json
          user_id: string
        }
        Insert: {
          approval_state?: string
          completed_effects?: Json
          created_at?: string
          from_specialist_id: string
          from_specialist_version: string
          from_stage_index?: number
          id?: string
          next_required_stage?: Json | null
          objective: string
          provider_evidence?: Json
          relevant_constraints?: Json
          run_id: string
          task_id: string
          to_specialist_id: string
          to_specialist_version: string
          unsatisfied_effects?: Json
          user_id: string
        }
        Update: {
          approval_state?: string
          completed_effects?: Json
          created_at?: string
          from_specialist_id?: string
          from_specialist_version?: string
          from_stage_index?: number
          id?: string
          next_required_stage?: Json | null
          objective?: string
          provider_evidence?: Json
          relevant_constraints?: Json
          run_id?: string
          task_id?: string
          to_specialist_id?: string
          to_specialist_version?: string
          unsatisfied_effects?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_handoffs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          active_specialist_id: string
          active_specialist_version: string
          application_state: Json | null
          attempt_count: number
          browser_session_id: string | null
          cancelled_at: string | null
          capability: string
          completed_at: string | null
          completed_effects: Json
          context: Json
          created_at: string
          current_step: number
          error: string | null
          error_code: string | null
          external_correlation_id: string | null
          id: string
          intent: Json
          lease_expires_at: string | null
          lease_owner: string | null
          objective: string
          openai_response_id: string | null
          plan: Json
          progress: Json
          reasoning_model: string
          result: Json | null
          retryable: boolean
          routing_source: string
          specialist_id: string
          specialist_stage_index: number
          specialist_stages: Json
          specialist_version: string
          started_at: string | null
          status: string
          strategy: string
          task_completion_policy: string
          task_contract: string
          task_id: string | null
          unsatisfied_effects: Json
          updated_at: string
          user_id: string
          version: number
          waiting_reason: string
        }
        Insert: {
          active_specialist_id?: string
          active_specialist_version?: string
          application_state?: Json | null
          attempt_count?: number
          browser_session_id?: string | null
          cancelled_at?: string | null
          capability: string
          completed_at?: string | null
          completed_effects?: Json
          context?: Json
          created_at?: string
          current_step?: number
          error?: string | null
          error_code?: string | null
          external_correlation_id?: string | null
          id?: string
          intent?: Json
          lease_expires_at?: string | null
          lease_owner?: string | null
          objective: string
          openai_response_id?: string | null
          plan?: Json
          progress?: Json
          reasoning_model?: string
          result?: Json | null
          retryable?: boolean
          routing_source?: string
          specialist_id?: string
          specialist_stage_index?: number
          specialist_stages?: Json
          specialist_version?: string
          started_at?: string | null
          status: string
          strategy?: string
          task_completion_policy?: string
          task_contract?: string
          task_id?: string | null
          unsatisfied_effects?: Json
          updated_at?: string
          user_id: string
          version?: number
          waiting_reason?: string
        }
        Update: {
          active_specialist_id?: string
          active_specialist_version?: string
          application_state?: Json | null
          attempt_count?: number
          browser_session_id?: string | null
          cancelled_at?: string | null
          capability?: string
          completed_at?: string | null
          completed_effects?: Json
          context?: Json
          created_at?: string
          current_step?: number
          error?: string | null
          error_code?: string | null
          external_correlation_id?: string | null
          id?: string
          intent?: Json
          lease_expires_at?: string | null
          lease_owner?: string | null
          objective?: string
          openai_response_id?: string | null
          plan?: Json
          progress?: Json
          reasoning_model?: string
          result?: Json | null
          retryable?: boolean
          routing_source?: string
          specialist_id?: string
          specialist_stage_index?: number
          specialist_stages?: Json
          specialist_version?: string
          started_at?: string | null
          status?: string
          strategy?: string
          task_completion_policy?: string
          task_contract?: string
          task_id?: string | null
          unsatisfied_effects?: Json
          updated_at?: string
          user_id?: string
          version?: number
          waiting_reason?: string
        }
        Relationships: []
      }
      agent_user_preferences: {
        Row: {
          default_meeting_minutes: number
          home_airport: string | null
          preferred_cabin: string
          preferred_currency: string
          timezone: string
          updated_at: string
          user_id: string
          working_hours_end: string
          working_hours_start: string
        }
        Insert: {
          default_meeting_minutes?: number
          home_airport?: string | null
          preferred_cabin?: string
          preferred_currency?: string
          timezone?: string
          updated_at?: string
          user_id: string
          working_hours_end?: string
          working_hours_start?: string
        }
        Update: {
          default_meeting_minutes?: number
          home_airport?: string | null
          preferred_cabin?: string
          preferred_currency?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          working_hours_end?: string
          working_hours_start?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          id: number
          requested_at: string
          user_id: string
        }
        Insert: {
          id?: never
          requested_at?: string
          user_id: string
        }
        Update: {
          id?: never
          requested_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applicant_profiles: {
        Row: {
          consent: Json
          consent_granted: boolean
          created_at: string
          id: string
          profile: Json
          schema_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          consent?: Json
          consent_granted?: boolean
          created_at?: string
          id?: string
          profile?: Json
          schema_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          consent?: Json
          consent_granted?: boolean
          created_at?: string
          id?: string
          profile?: Json
          schema_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      application_artifacts: {
        Row: {
          application_case_id: string | null
          approval_status: string
          author_type: string
          checksum: string
          created_at: string
          file_asset_id: string
          final_submission_destination: string | null
          id: string
          kind: string
          metadata: Json
          opportunity_id: string | null
          original_asset_ids: string[]
          prompt_version: string | null
          revision_history: Json
          revision_of: string | null
          template_version: string | null
          user_id: string
        }
        Insert: {
          application_case_id?: string | null
          approval_status?: string
          author_type: string
          checksum: string
          created_at?: string
          file_asset_id: string
          final_submission_destination?: string | null
          id?: string
          kind: string
          metadata?: Json
          opportunity_id?: string | null
          original_asset_ids?: string[]
          prompt_version?: string | null
          revision_history?: Json
          revision_of?: string | null
          template_version?: string | null
          user_id: string
        }
        Update: {
          application_case_id?: string | null
          approval_status?: string
          author_type?: string
          checksum?: string
          created_at?: string
          file_asset_id?: string
          final_submission_destination?: string | null
          id?: string
          kind?: string
          metadata?: Json
          opportunity_id?: string | null
          original_asset_ids?: string[]
          prompt_version?: string | null
          revision_history?: Json
          revision_of?: string | null
          template_version?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_artifacts_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_artifacts_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_artifacts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "application_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_artifacts_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "application_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      application_campaigns: {
        Row: {
          application_kind: string
          approved_strategy: Json | null
          created_at: string
          data: Json
          id: string
          intake_year: number | null
          next_action: string
          objective: string
          owner_specialist_id: string
          progress: Json
          status: string
          target_quantity: number | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_kind: string
          approved_strategy?: Json | null
          created_at?: string
          data?: Json
          id?: string
          intake_year?: number | null
          next_action?: string
          objective: string
          owner_specialist_id?: string
          progress?: Json
          status?: string
          target_quantity?: number | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_kind?: string
          approved_strategy?: Json | null
          created_at?: string
          data?: Json
          id?: string
          intake_year?: number | null
          next_action?: string
          objective?: string
          owner_specialist_id?: string
          progress?: Json
          status?: string
          target_quantity?: number | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_campaigns_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_cases: {
        Row: {
          application_id: string | null
          campaign_id: string
          created_at: string
          current_stage: string
          data: Json
          final_outcome: string | null
          id: string
          next_action: string
          opportunity_id: string
          portal_account: Json
          portal_session_id: string | null
          status: string
          submission_attempt_key: string | null
          submitted_at: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          campaign_id: string
          created_at?: string
          current_stage?: string
          data?: Json
          final_outcome?: string | null
          id?: string
          next_action?: string
          opportunity_id: string
          portal_account?: Json
          portal_session_id?: string | null
          status?: string
          submission_attempt_key?: string | null
          submitted_at?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          campaign_id?: string
          created_at?: string
          current_stage?: string
          data?: Json
          final_outcome?: string | null
          id?: string
          next_action?: string
          opportunity_id?: string
          portal_account?: Json
          portal_session_id?: string | null
          status?: string
          submission_attempt_key?: string | null
          submitted_at?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_cases_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_cases_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "application_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_cases_portal_session_id_fkey"
            columns: ["portal_session_id"]
            isOneToOne: false
            referencedRelation: "browser_execution_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_cases_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_communications: {
        Row: {
          agent_run_id: string | null
          application_case_id: string
          campaign_id: string | null
          classification: string | null
          contact_id: string | null
          created_at: string
          data: Json
          direction: string
          human_assignment_id: string | null
          id: string
          idempotency_key: string
          provider: string
          provider_message_id: string | null
          provider_thread_id: string | null
          task_id: string | null
          user_id: string
        }
        Insert: {
          agent_run_id?: string | null
          application_case_id: string
          campaign_id?: string | null
          classification?: string | null
          contact_id?: string | null
          created_at?: string
          data?: Json
          direction: string
          human_assignment_id?: string | null
          id?: string
          idempotency_key: string
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          task_id?: string | null
          user_id: string
        }
        Update: {
          agent_run_id?: string | null
          application_case_id?: string
          campaign_id?: string | null
          classification?: string | null
          contact_id?: string | null
          created_at?: string
          data?: Json
          direction?: string
          human_assignment_id?: string | null
          id?: string
          idempotency_key?: string
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_communications_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_communications_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_communications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_communications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "application_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_communications_human_assignment_id_fkey"
            columns: ["human_assignment_id"]
            isOneToOne: false
            referencedRelation: "human_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_communications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_contacts: {
        Row: {
          agent_run_id: string | null
          application_case_id: string | null
          campaign_id: string | null
          consent_to_contact: boolean
          created_at: string
          data: Json
          email: string | null
          gmail_thread_id: string | null
          id: string
          idempotency_key: string
          kind: string
          last_provider_message_id: string | null
          name: string
          provider_contact_id: string | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_run_id?: string | null
          application_case_id?: string | null
          campaign_id?: string | null
          consent_to_contact?: boolean
          created_at?: string
          data?: Json
          email?: string | null
          gmail_thread_id?: string | null
          id?: string
          idempotency_key: string
          kind: string
          last_provider_message_id?: string | null
          name: string
          provider_contact_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_run_id?: string | null
          application_case_id?: string | null
          campaign_id?: string | null
          consent_to_contact?: boolean
          created_at?: string
          data?: Json
          email?: string | null
          gmail_thread_id?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          last_provider_message_id?: string | null
          name?: string
          provider_contact_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_contacts_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_contacts_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_contacts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_evidence: {
        Row: {
          agent_run_id: string | null
          application_case_id: string
          asset_id: string | null
          campaign_id: string | null
          captured_at: string
          excerpt: string | null
          human_assignment_id: string | null
          id: string
          idempotency_key: string
          kind: string
          metadata: Json
          provider: string | null
          provider_message_id: string | null
          provider_thread_id: string | null
          source_url: string | null
          task_id: string | null
          user_id: string
        }
        Insert: {
          agent_run_id?: string | null
          application_case_id: string
          asset_id?: string | null
          campaign_id?: string | null
          captured_at?: string
          excerpt?: string | null
          human_assignment_id?: string | null
          id?: string
          idempotency_key: string
          kind: string
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          source_url?: string | null
          task_id?: string | null
          user_id: string
        }
        Update: {
          agent_run_id?: string | null
          application_case_id?: string
          asset_id?: string | null
          campaign_id?: string | null
          captured_at?: string
          excerpt?: string | null
          human_assignment_id?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          source_url?: string | null
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_evidence_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_evidence_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_evidence_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_evidence_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_evidence_human_assignment_id_fkey"
            columns: ["human_assignment_id"]
            isOneToOne: false
            referencedRelation: "human_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_inter_agent_requests: {
        Row: {
          agent_run_id: string
          application_case_id: string
          attempt_count: number
          completion_evidence: Json
          created_at: string
          from_specialist_id: string
          human_assignment_id: string | null
          id: string
          idempotency_key: string
          last_error: Json | null
          next_attempt_at: string | null
          payload: Json
          provider_action_id: string | null
          request_kind: string
          result: Json | null
          status: string
          task_id: string
          to_specialist_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_run_id: string
          application_case_id: string
          attempt_count?: number
          completion_evidence?: Json
          created_at?: string
          from_specialist_id: string
          human_assignment_id?: string | null
          id?: string
          idempotency_key: string
          last_error?: Json | null
          next_attempt_at?: string | null
          payload?: Json
          provider_action_id?: string | null
          request_kind: string
          result?: Json | null
          status?: string
          task_id: string
          to_specialist_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_run_id?: string
          application_case_id?: string
          attempt_count?: number
          completion_evidence?: Json
          created_at?: string
          from_specialist_id?: string
          human_assignment_id?: string | null
          id?: string
          idempotency_key?: string
          last_error?: Json | null
          next_attempt_at?: string | null
          payload?: Json
          provider_action_id?: string | null
          request_kind?: string
          result?: Json | null
          status?: string
          task_id?: string
          to_specialist_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_inter_agent_requests_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_inter_agent_requests_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_inter_agent_requests_human_assignment_id_fkey"
            columns: ["human_assignment_id"]
            isOneToOne: false
            referencedRelation: "human_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_inter_agent_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_opportunities: {
        Row: {
          application_url: string | null
          campaign_id: string
          citations: Json
          confidence: number
          created_at: string
          data: Json
          deadline_at: string | null
          deadline_timezone: string | null
          fit_score: number
          id: string
          institution: string
          official_url: string
          programme_title: string
          recommendation_rationale: string
          retrieved_at: string
          updated_at: string
          user_id: string
          verification_status: string
        }
        Insert: {
          application_url?: string | null
          campaign_id: string
          citations?: Json
          confidence?: number
          created_at?: string
          data?: Json
          deadline_at?: string | null
          deadline_timezone?: string | null
          fit_score?: number
          id?: string
          institution: string
          official_url: string
          programme_title: string
          recommendation_rationale?: string
          retrieved_at?: string
          updated_at?: string
          user_id: string
          verification_status?: string
        }
        Update: {
          application_url?: string | null
          campaign_id?: string
          citations?: Json
          confidence?: number
          created_at?: string
          data?: Json
          deadline_at?: string | null
          deadline_timezone?: string | null
          fit_score?: number
          id?: string
          institution?: string
          official_url?: string
          programme_title?: string
          recommendation_rationale?: string
          retrieved_at?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_opportunities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      application_otp_events: {
        Row: {
          application_case_id: string
          code_hash: string | null
          created_at: string
          destination_email: string
          id: string
          idempotency_key: string
          institution: string
          matched_at: string | null
          matched_message_id: string | null
          matched_thread_id: string | null
          portal: string
          requested_at: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          code_hash?: string | null
          created_at?: string
          destination_email: string
          id?: string
          idempotency_key: string
          institution: string
          matched_at?: string | null
          matched_message_id?: string | null
          matched_thread_id?: string | null
          portal: string
          requested_at: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          code_hash?: string | null
          created_at?: string
          destination_email?: string
          id?: string
          idempotency_key?: string
          institution?: string
          matched_at?: string | null
          matched_message_id?: string | null
          matched_thread_id?: string | null
          portal?: string
          requested_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_otp_events_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      application_requirements: {
        Row: {
          application_case_id: string
          blocker_reason: string | null
          category: string
          created_at: string
          deadline_at: string | null
          deadline_timezone: string | null
          exact_instructions: string
          id: string
          linked_artifact_id: string | null
          name: string
          required: boolean
          responsible_party: string
          source: Json | null
          status: string
          updated_at: string
          user_id: string
          verification_evidence_ids: string[]
        }
        Insert: {
          application_case_id: string
          blocker_reason?: string | null
          category: string
          created_at?: string
          deadline_at?: string | null
          deadline_timezone?: string | null
          exact_instructions?: string
          id?: string
          linked_artifact_id?: string | null
          name: string
          required?: boolean
          responsible_party?: string
          source?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          verification_evidence_ids?: string[]
        }
        Update: {
          application_case_id?: string
          blocker_reason?: string | null
          category?: string
          created_at?: string
          deadline_at?: string | null
          deadline_timezone?: string | null
          exact_instructions?: string
          id?: string
          linked_artifact_id?: string | null
          name?: string
          required?: boolean
          responsible_party?: string
          source?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          verification_evidence_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "application_requirements_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_requirements_linked_artifact_fk"
            columns: ["linked_artifact_id"]
            isOneToOne: false
            referencedRelation: "application_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      application_submission_attempts: {
        Row: {
          application_case_id: string
          application_id: string | null
          completed_at: string | null
          created_at: string
          evidence: Json
          id: string
          idempotency_key: string
          status: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          application_id?: string | null
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key: string
          status?: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          application_id?: string | null
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_submission_attempts_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      application_writers: {
        Row: {
          active_assignments: number
          availability: string
          created_at: string
          data: Json
          degree_fields: string[]
          email: string
          id: string
          name: string
          price: number | null
          price_currency: string | null
          programme_familiarity: string[]
          quality_score: number | null
          reliability_score: number | null
          revision_rate: number | null
          specialties: string[]
          turnaround_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_assignments?: number
          availability?: string
          created_at?: string
          data?: Json
          degree_fields?: string[]
          email: string
          id?: string
          name: string
          price?: number | null
          price_currency?: string | null
          programme_familiarity?: string[]
          quality_score?: number | null
          reliability_score?: number | null
          revision_rate?: number | null
          specialties?: string[]
          turnaround_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_assignments?: number
          availability?: string
          created_at?: string
          data?: Json
          degree_fields?: string[]
          email?: string
          id?: string
          name?: string
          price?: number | null
          price_currency?: string | null
          programme_familiarity?: string[]
          quality_score?: number | null
          reliability_score?: number | null
          revision_rate?: number | null
          specialties?: string[]
          turnaround_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      browser_execution_sessions: {
        Row: {
          allowed_domains: string[]
          checkpoint: Json
          created_at: string
          current_domain: string | null
          current_url: string | null
          expires_at: string | null
          id: string
          last_observed_at: string | null
          objective: string
          payment_boundary_reached: boolean
          resumable: boolean
          run_id: string
          status: string
          updated_at: string
          user_id: string
          worker_session_id: string | null
        }
        Insert: {
          allowed_domains?: string[]
          checkpoint?: Json
          created_at?: string
          current_domain?: string | null
          current_url?: string | null
          expires_at?: string | null
          id?: string
          last_observed_at?: string | null
          objective: string
          payment_boundary_reached?: boolean
          resumable?: boolean
          run_id: string
          status: string
          updated_at?: string
          user_id: string
          worker_session_id?: string | null
        }
        Update: {
          allowed_domains?: string[]
          checkpoint?: Json
          created_at?: string
          current_domain?: string | null
          current_url?: string | null
          expires_at?: string | null
          id?: string
          last_observed_at?: string | null
          objective?: string
          payment_boundary_reached?: boolean
          resumable?: boolean
          run_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          worker_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "browser_execution_sessions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      completion_events: {
        Row: {
          completed_at: string
          completed_count: number
          creator_id: string
          id: string
          local_date: string
          task_title: string
          total_count: number
        }
        Insert: {
          completed_at?: string
          completed_count: number
          creator_id: string
          id?: string
          local_date: string
          task_title?: string
          total_count: number
        }
        Update: {
          completed_at?: string
          completed_count?: number
          creator_id?: string
          id?: string
          local_date?: string
          task_title?: string
          total_count?: number
        }
        Relationships: []
      }
      connections: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_reviews: {
        Row: {
          blocker: string
          created_at: string
          id: string
          review_date: string
          tomorrow: string
          updated_at: string
          user_id: string
          win: string
        }
        Insert: {
          blocker?: string
          created_at?: string
          id?: string
          review_date: string
          tomorrow?: string
          updated_at?: string
          user_id: string
          win?: string
        }
        Update: {
          blocker?: string
          created_at?: string
          id?: string
          review_date?: string
          tomorrow?: string
          updated_at?: string
          user_id?: string
          win?: string
        }
        Relationships: []
      }
      file_assets: {
        Row: {
          agent_run_id: string | null
          application_case_id: string | null
          approval_status: string
          asset_kind: string
          author_type: string | null
          checksum: string
          created_at: string
          final_submission_destination: string | null
          id: string
          mime_type: string
          opportunity_id: string | null
          original_asset_id: string | null
          original_filename: string
          prompt_version: string | null
          reusable: boolean
          revision_history: Json
          size_bytes: number
          source: string
          source_asset_ids: string[]
          storage_key: string
          task_id: string | null
          template_version: string | null
          user_id: string
        }
        Insert: {
          agent_run_id?: string | null
          application_case_id?: string | null
          approval_status?: string
          asset_kind?: string
          author_type?: string | null
          checksum: string
          created_at?: string
          final_submission_destination?: string | null
          id?: string
          mime_type: string
          opportunity_id?: string | null
          original_asset_id?: string | null
          original_filename: string
          prompt_version?: string | null
          reusable?: boolean
          revision_history?: Json
          size_bytes: number
          source?: string
          source_asset_ids?: string[]
          storage_key: string
          task_id?: string | null
          template_version?: string | null
          user_id: string
        }
        Update: {
          agent_run_id?: string | null
          application_case_id?: string | null
          approval_status?: string
          asset_kind?: string
          author_type?: string | null
          checksum?: string
          created_at?: string
          final_submission_destination?: string | null
          id?: string
          mime_type?: string
          opportunity_id?: string | null
          original_asset_id?: string | null
          original_filename?: string
          prompt_version?: string | null
          reusable?: boolean
          revision_history?: Json
          size_bytes?: number
          source?: string
          source_asset_ids?: string[]
          storage_key?: string
          task_id?: string | null
          template_version?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_assets_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "application_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_original_asset_id_fkey"
            columns: ["original_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          color: string
          created_at: string
          id: string
          position: number
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
          why: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          position?: number
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
          why?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          position?: number
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          why?: string
        }
        Relationships: []
      }
      google_calendar_events: {
        Row: {
          all_day: boolean
          calendar_color: string
          calendar_id: string
          calendar_name: string
          created_at: string
          end_at: string | null
          end_date: string | null
          google_event_id: string
          google_updated_at: string | null
          html_link: string
          id: string
          last_seen_at: string
          location: string
          start_at: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          calendar_color?: string
          calendar_id: string
          calendar_name?: string
          created_at?: string
          end_at?: string | null
          end_date?: string | null
          google_event_id: string
          google_updated_at?: string | null
          html_link?: string
          id?: string
          last_seen_at?: string
          location?: string
          start_at?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          calendar_color?: string
          calendar_id?: string
          calendar_name?: string
          created_at?: string
          end_at?: string | null
          end_date?: string | null
          google_event_id?: string
          google_updated_at?: string | null
          html_link?: string
          id?: string
          last_seen_at?: string
          location?: string
          start_at?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_sync_state: {
        Row: {
          last_error: string
          last_synced_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_error?: string
          last_synced_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_error?: string
          last_synced_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      human_assignments: {
        Row: {
          agent_run_id: string | null
          application_case_id: string
          brief: string
          campaign_id: string | null
          created_at: string
          deadline_at: string | null
          deadline_timezone: string | null
          deliverable: string
          escalation_level: number
          final_artifact_id: string | null
          gmail_thread_id: string | null
          id: string
          idempotency_key: string
          last_provider_message_id: string | null
          payment_status: string
          price: number | null
          price_currency: string | null
          quality_review: Json
          questions: Json
          revisions: number
          sla_breaches: Json
          source_material_ids: string[]
          specialty: string
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          writer_id: string
        }
        Insert: {
          agent_run_id?: string | null
          application_case_id: string
          brief?: string
          campaign_id?: string | null
          created_at?: string
          deadline_at?: string | null
          deadline_timezone?: string | null
          deliverable: string
          escalation_level?: number
          final_artifact_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          idempotency_key: string
          last_provider_message_id?: string | null
          payment_status?: string
          price?: number | null
          price_currency?: string | null
          quality_review?: Json
          questions?: Json
          revisions?: number
          sla_breaches?: Json
          source_material_ids?: string[]
          specialty?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          writer_id: string
        }
        Update: {
          agent_run_id?: string | null
          application_case_id?: string
          brief?: string
          campaign_id?: string | null
          created_at?: string
          deadline_at?: string | null
          deadline_timezone?: string | null
          deliverable?: string
          escalation_level?: number
          final_artifact_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          idempotency_key?: string
          last_provider_message_id?: string | null
          payment_status?: string
          price?: number | null
          price_currency?: string | null
          quality_review?: Json
          questions?: Json
          revisions?: number
          sla_breaches?: Json
          source_material_ids?: string[]
          specialty?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          writer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_assignments_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_assignments_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_assignments_final_artifact_id_fkey"
            columns: ["final_artifact_id"]
            isOneToOne: false
            referencedRelation: "application_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          goal_id: string
          id: string
          position: number
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          goal_id: string
          id?: string
          position?: number
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          position?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_creators: {
        Row: {
          created_at: string
          creator_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          viewer_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          completion_alerts: boolean
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          timezone: string
          updated_at: string
          user_id: string
          web_push_enabled: boolean
        }
        Insert: {
          completion_alerts?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
          web_push_enabled?: boolean
        }
        Update: {
          completion_alerts?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          web_push_enabled?: boolean
        }
        Relationships: []
      }
      planner_records: {
        Row: {
          created_at: string
          data: Json
          deleted_at: string | null
          field_versions: Json
          parent_id: string | null
          record_id: string
          record_type: string
          revision: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          data?: Json
          deleted_at?: string | null
          field_versions?: Json
          parent_id?: string | null
          record_id: string
          record_type: string
          revision?: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          data?: Json
          deleted_at?: string | null
          field_versions?: Json
          parent_id?: string | null
          record_id?: string
          record_type?: string
          revision?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      portal_checkpoints: {
        Row: {
          account_identifier: string | null
          application_case_id: string
          completion_signal: string | null
          contract: Json
          created_at: string
          entered_values: Json
          id: string
          idempotency_key: string
          next_step: string | null
          portal: string
          save_confirmation: string | null
          screenshots: string[]
          section: string
          session_information: Json
          uploaded_artifacts: string[]
          url: string
          user_id: string
          validation_errors: Json
          value_sources: Json
          verified: boolean
        }
        Insert: {
          account_identifier?: string | null
          application_case_id: string
          completion_signal?: string | null
          contract?: Json
          created_at?: string
          entered_values?: Json
          id?: string
          idempotency_key: string
          next_step?: string | null
          portal: string
          save_confirmation?: string | null
          screenshots?: string[]
          section: string
          session_information?: Json
          uploaded_artifacts?: string[]
          url: string
          user_id: string
          validation_errors?: Json
          value_sources?: Json
          verified?: boolean
        }
        Update: {
          account_identifier?: string | null
          application_case_id?: string
          completion_signal?: string | null
          contract?: Json
          created_at?: string
          entered_values?: Json
          id?: string
          idempotency_key?: string
          next_step?: string | null
          portal?: string
          save_confirmation?: string | null
          screenshots?: string[]
          section?: string
          session_information?: Json
          uploaded_artifacts?: string[]
          url?: string
          user_id?: string
          validation_errors?: Json
          value_sources?: Json
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "portal_checkpoints_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string
          bio: string
          created_at: string
          dark_mode: boolean
          default_task_visibility: string
          display_name: string
          id: string
          onboarding_completed: boolean
          timezone: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string
          bio?: string
          created_at?: string
          dark_mode?: boolean
          default_task_visibility?: string
          display_name?: string
          id: string
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string
          bio?: string
          created_at?: string
          dark_mode?: boolean
          default_task_visibility?: string
          display_name?: string
          id?: string
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          completion_event_id: string
          delivered_at: string
          push_subscription_id: string
        }
        Insert: {
          completion_event_id: string
          delivered_at?: string
          push_subscription_id: string
        }
        Update: {
          completion_event_id?: string
          delivered_at?: string
          push_subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_completion_event_id_fkey"
            columns: ["completion_event_id"]
            isOneToOne: false
            referencedRelation: "completion_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_deliveries_push_subscription_id_fkey"
            columns: ["push_subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string
          user_id?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          emoji: string
          update_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          update_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "shared_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          blockers: string
          continue_doing: string
          created_at: string
          id: string
          review_date: string
          stop_doing: string
          updated_at: string
          user_id: string
          wins: string
        }
        Insert: {
          blockers?: string
          continue_doing?: string
          created_at?: string
          id?: string
          review_date: string
          stop_doing?: string
          updated_at?: string
          user_id: string
          wins?: string
        }
        Update: {
          blockers?: string
          continue_doing?: string
          created_at?: string
          id?: string
          review_date?: string
          stop_doing?: string
          updated_at?: string
          user_id?: string
          wins?: string
        }
        Relationships: []
      }
      scheduled_push_deliveries: {
        Row: {
          delivered_at: string
          delivery_key: string
          push_subscription_id: string
        }
        Insert: {
          delivered_at?: string
          delivery_key: string
          push_subscription_id: string
        }
        Update: {
          delivered_at?: string
          delivery_key?: string
          push_subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_push_deliveries_push_subscription_id_fkey"
            columns: ["push_subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_updates: {
        Row: {
          created_at: string
          goal_id: string | null
          id: string
          message: string
          milestone_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_id?: string | null
          id?: string
          message?: string
          milestone_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          goal_id?: string | null
          id?: string
          message?: string
          milestone_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_updates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_updates_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          position: number
          task_id: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          position?: number
          task_id: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      task_tags: {
        Row: {
          tag_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          tag_id: string
          task_id: string
          user_id: string
        }
        Update: {
          tag_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          carried_count: number
          completed_at: string | null
          created_at: string
          description: string
          due_date: string | null
          due_time: string | null
          estimate_minutes: number
          goal_id: string | null
          id: string
          last_carry_reason: string
          list_id: string | null
          position: number
          priority: string
          recurrence: string
          title: string
          top_three: boolean
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          carried_count?: number
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          due_time?: string | null
          estimate_minutes?: number
          goal_id?: string | null
          id?: string
          last_carry_reason?: string
          list_id?: string | null
          position?: number
          priority?: string
          recurrence?: string
          title: string
          top_three?: boolean
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          carried_count?: number
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          due_time?: string | null
          estimate_minutes?: number
          goal_id?: string | null
          id?: string
          last_carry_reason?: string
          list_id?: string | null
          position?: number
          priority?: string
          recurrence?: string
          title?: string
          top_three?: boolean
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_accountability_invite: {
        Args: { invite_token: string }
        Returns: boolean
      }
      can_read_planner_task: {
        Args: { p_owner_id: string; p_task_id: string }
        Returns: boolean
      }
      claim_ai_coach_usage: {
        Args: { p_user_id: string }
        Returns: number
      }
      claim_agent_run: {
        Args: {
          p_lease_seconds?: number
          p_run_id: string
          p_worker_id: string
        }
        Returns: {
          active_specialist_id: string
          active_specialist_version: string
          application_state: Json | null
          attempt_count: number
          browser_session_id: string | null
          cancelled_at: string | null
          capability: string
          completed_at: string | null
          completed_effects: Json
          context: Json
          created_at: string
          current_step: number
          error: string | null
          error_code: string | null
          external_correlation_id: string | null
          id: string
          intent: Json
          lease_expires_at: string | null
          lease_owner: string | null
          objective: string
          openai_response_id: string | null
          plan: Json
          progress: Json
          reasoning_model: string
          result: Json | null
          retryable: boolean
          routing_source: string
          specialist_id: string
          specialist_stage_index: number
          specialist_stages: Json
          specialist_version: string
          started_at: string | null
          status: string
          strategy: string
          task_completion_policy: string
          task_contract: string
          task_id: string | null
          unsatisfied_effects: Json
          updated_at: string
          user_id: string
          version: number
          waiting_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_application_submission: {
        Args: {
          p_case_id: string
          p_idempotency_key: string
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          attempt_id: string
          reason: string
        }[]
      }
      complete_agent_run: {
        Args: {
          p_expected_version: number
          p_mark_task_complete: boolean
          p_result: Json
          p_run_id: string
        }
        Returns: {
          active_specialist_id: string
          active_specialist_version: string
          application_state: Json | null
          attempt_count: number
          browser_session_id: string | null
          cancelled_at: string | null
          capability: string
          completed_at: string | null
          completed_effects: Json
          context: Json
          created_at: string
          current_step: number
          error: string | null
          error_code: string | null
          external_correlation_id: string | null
          id: string
          intent: Json
          lease_expires_at: string | null
          lease_owner: string | null
          objective: string
          openai_response_id: string | null
          plan: Json
          progress: Json
          reasoning_model: string
          result: Json | null
          retryable: boolean
          routing_source: string
          specialist_id: string
          specialist_stage_index: number
          specialist_stages: Json
          specialist_version: string
          started_at: string | null
          status: string
          strategy: string
          task_completion_policy: string
          task_contract: string
          task_id: string | null
          unsatisfied_effects: Json
          updated_at: string
          user_id: string
          version: number
          waiting_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_demo_flight_handoff: {
        Args: { p_expected_version: number; p_result: Json; p_run_id: string }
        Returns: {
          active_specialist_id: string
          active_specialist_version: string
          application_state: Json | null
          attempt_count: number
          browser_session_id: string | null
          cancelled_at: string | null
          capability: string
          completed_at: string | null
          completed_effects: Json
          context: Json
          created_at: string
          current_step: number
          error: string | null
          error_code: string | null
          external_correlation_id: string | null
          id: string
          intent: Json
          lease_expires_at: string | null
          lease_owner: string | null
          objective: string
          openai_response_id: string | null
          plan: Json
          progress: Json
          reasoning_model: string
          result: Json | null
          retryable: boolean
          routing_source: string
          specialist_id: string
          specialist_stage_index: number
          specialist_stages: Json
          specialist_version: string
          started_at: string | null
          status: string
          strategy: string
          task_completion_policy: string
          task_contract: string
          task_id: string | null
          unsatisfied_effects: Json
          updated_at: string
          user_id: string
          version: number
          waiting_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      completion_alert_feed: {
        Args: { p_after: string }
        Returns: {
          avatar_url: string
          completed_at: string
          completed_count: number
          creator_id: string
          display_name: string
          id: string
          task_title: string
          total_count: number
          username: string
        }[]
      }
      creator_directory: {
        Args: { p_username?: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          followed_by_me: boolean
          follower_count: number
          id: string
          username: string
        }[]
      }
      creator_today: {
        Args: { p_creator_id: string }
        Returns: {
          completed_at: string
          due: string
          id: string
          time: string
          title: string
          visibility: string
        }[]
      }
      get_creator_today: { Args: { p_username: string }; Returns: Json }
      google_agent_connection_status: {
        Args: never
        Returns: {
          account_email: string
          scopes: string[]
          status: string
          token_expires_at: string
          updated_at: string
        }[]
      }
      merge_planner_record: {
        Args: {
          p_deleted_at: string
          p_field_versions: Json
          p_parent_id: string
          p_patch: Json
          p_record_id: string
          p_record_type: string
        }
        Returns: {
          created_at: string
          data: Json
          deleted_at: string | null
          field_versions: Json
          parent_id: string | null
          record_id: string
          record_type: string
          revision: number
          updated_at: string
          user_id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "planner_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_application_submission: {
        Args: {
          p_application_id: string
          p_attempt_id: string
          p_evidence: Json
        }
        Returns: {
          application_id: string | null
          campaign_id: string
          created_at: string
          current_stage: string
          data: Json
          final_outcome: string | null
          id: string
          next_action: string
          opportunity_id: string
          portal_account: Json
          portal_session_id: string | null
          status: string
          submission_attempt_key: string | null
          submitted_at: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_applicant_reuse_consent: {
        Args: { p_granted: boolean; p_scope: string }
        Returns: {
          consent: Json
          consent_granted: boolean
          created_at: string
          id: string
          profile: Json
          schema_version: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "applicant_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_file_asset_reusable: {
        Args: { p_asset_id: string; p_reusable: boolean }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
