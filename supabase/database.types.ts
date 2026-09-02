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
          task_spec: Json
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
          task_spec?: Json
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
          task_spec?: Json
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
      application_admissions_clarifications: {
        Row: {
          admissions_contact: Json | null
          application_case_id: string
          campaign_id: string | null
          conflicting_evidence: Json
          contact_source: string | null
          created_at: string
          deadline_at: string | null
          deadline_relevance: string | null
          deadline_timezone: string | null
          drafted_question: string
          evidence_ids: string[]
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          institution: string
          idempotency_key: string
          programme: string
          question_category: string
          resulting_requirement_updates: Json
          resolved_interpretation: Json | null
          requirement_id: string
          risk: string
          sources_checked: string[]
          status: string
          task_id: string | null
          unresolved_issue: string
          unresolved_reason: string
          updated_at: string
          user_id: string
          why_necessary: string
        }
        Insert: {
          admissions_contact?: Json | null
          application_case_id: string
          campaign_id?: string | null
          conflicting_evidence?: Json
          contact_source?: string | null
          created_at?: string
          deadline_at?: string | null
          deadline_relevance?: string | null
          deadline_timezone?: string | null
          drafted_question: string
          evidence_ids?: string[]
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          institution: string
          idempotency_key: string
          programme: string
          question_category: string
          resulting_requirement_updates?: Json
          resolved_interpretation?: Json | null
          requirement_id: string
          risk?: string
          sources_checked?: string[]
          status?: string
          task_id?: string | null
          unresolved_issue: string
          unresolved_reason: string
          updated_at?: string
          user_id: string
          why_necessary: string
        }
        Update: {
          admissions_contact?: Json | null
          application_case_id?: string
          campaign_id?: string | null
          conflicting_evidence?: Json
          contact_source?: string | null
          created_at?: string
          deadline_at?: string | null
          deadline_relevance?: string | null
          deadline_timezone?: string | null
          drafted_question?: string
          evidence_ids?: string[]
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          institution?: string
          idempotency_key?: string
          programme?: string
          question_category?: string
          resulting_requirement_updates?: Json
          resolved_interpretation?: Json | null
          requirement_id?: string
          risk?: string
          sources_checked?: string[]
          status?: string
          task_id?: string | null
          unresolved_issue?: string
          unresolved_reason?: string
          updated_at?: string
          user_id?: string
          why_necessary?: string
        }
        Relationships: []
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
      application_recommender_candidates: {
        Row: {
          candidate_key: string
          created_at: string
          current_title: string | null
          data: Json
          department: string | null
          email: string | null
          id: string
          institution: string | null
          name: string
          relationship_evidence: Json
          relationship_type: string
          reusable: boolean
          source_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_key: string
          created_at?: string
          current_title?: string | null
          data?: Json
          department?: string | null
          email?: string | null
          id?: string
          institution?: string | null
          name: string
          relationship_evidence?: Json
          relationship_type?: string
          reusable?: boolean
          source_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_key?: string
          created_at?: string
          current_title?: string | null
          data?: Json
          department?: string | null
          email?: string | null
          id?: string
          institution?: string | null
          name?: string
          relationship_evidence?: Json
          relationship_type?: string
          reusable?: boolean
          source_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      application_recommendation_campaigns: {
        Row: {
          application_case_id: string
          campaign_id: string | null
          candidates: Json
          created_at: string
          data: Json
          id: string
          idempotency_key: string
          interaction_metrics: Json
          opportunity_id: string | null
          requirement_graph: Json
          requirements: Json
          reusable_context: Json
          status: string
          strategy: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          campaign_id?: string | null
          candidates?: Json
          created_at?: string
          data?: Json
          id?: string
          idempotency_key: string
          interaction_metrics?: Json
          opportunity_id?: string | null
          requirement_graph?: Json
          requirements?: Json
          reusable_context?: Json
          status?: string
          strategy?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          campaign_id?: string | null
          candidates?: Json
          created_at?: string
          data?: Json
          id?: string
          idempotency_key?: string
          interaction_metrics?: Json
          opportunity_id?: string | null
          requirement_graph?: Json
          requirements?: Json
          reusable_context?: Json
          status?: string
          strategy?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_recommendation_campaigns_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_recommendation_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_recommendation_campaigns_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "application_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      application_recommendation_interactions: {
        Row: {
          agent_run_id: string | null
          application_case_id: string
          campaign_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          interaction_id: string
          kind: string
          question: string
          reason: string
          requirement_id: string
          response: Json | null
          reusable: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_run_id?: string | null
          application_case_id: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          interaction_id: string
          kind: string
          question: string
          reason: string
          requirement_id: string
          response?: Json | null
          reusable?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_run_id?: string | null
          application_case_id?: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          interaction_id?: string
          kind?: string
          question?: string
          reason?: string
          requirement_id?: string
          response?: Json | null
          reusable?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_recommendation_interactions_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_recommendation_interactions_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_recommendation_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_recommendation_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      application_work_sample_candidates: {
        Row: {
          application_case_id: string | null
          application_fit_score: number
          candidate_data: Json
          candidate_key: string
          created_at: string
          eligibility: string
          id: string
          quality_score: number
          selected: boolean
          source_asset_ids: string[]
          source_ids: string[]
          title: string
          updated_at: string
          user_id: string
          artifact_type: string
        }
        Insert: {
          application_case_id?: string | null
          application_fit_score?: number
          candidate_data?: Json
          candidate_key: string
          created_at?: string
          eligibility?: string
          id?: string
          quality_score?: number
          selected?: boolean
          source_asset_ids?: string[]
          source_ids?: string[]
          title: string
          updated_at?: string
          user_id: string
          artifact_type: string
        }
        Update: {
          application_case_id?: string | null
          application_fit_score?: number
          candidate_data?: Json
          candidate_key?: string
          created_at?: string
          eligibility?: string
          id?: string
          quality_score?: number
          selected?: boolean
          source_asset_ids?: string[]
          source_ids?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          artifact_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_work_sample_candidates_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      application_work_sample_interactions: {
        Row: {
          application_case_id: string
          created_at: string
          id: string
          idempotency_key: string
          interaction_id: string
          kind: string
          metric: Json
          options: Json
          reason: string
          reusable: boolean
          response: Json | null
          status: string
          question: string
          updated_at: string
          user_id: string
          work_sample_requirement_id: string | null
        }
        Insert: {
          application_case_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          interaction_id: string
          kind: string
          metric?: Json
          options?: Json
          reason: string
          reusable?: boolean
          response?: Json | null
          status?: string
          question: string
          updated_at?: string
          user_id: string
          work_sample_requirement_id?: string | null
        }
        Update: {
          application_case_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          interaction_id?: string
          kind?: string
          metric?: Json
          options?: Json
          reason?: string
          reusable?: boolean
          response?: Json | null
          status?: string
          question?: string
          updated_at?: string
          user_id?: string
          work_sample_requirement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_work_sample_interactions_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_work_sample_interactions_work_sample_requirement_id_fkey"
            columns: ["work_sample_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_work_sample_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      application_work_sample_requirements: {
        Row: {
          application_case_id: string
          created_at: string
          id: string
          idempotency_key: string
          mode: string
          opportunity_id: string | null
          requirement_data: Json
          requirement_key: string
          requirement_type: string
          source_evidence: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          mode: string
          opportunity_id?: string | null
          requirement_data?: Json
          requirement_key: string
          requirement_type: string
          source_evidence?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          mode?: string
          opportunity_id?: string | null
          requirement_data?: Json
          requirement_key?: string
          requirement_type?: string
          source_evidence?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_work_sample_requirements_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_work_sample_requirements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "application_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      application_work_sample_submissions: {
        Row: {
          application_case_id: string
          approval_state: string
          artifact_type: string
          candidate_id: string | null
          checksum: string
          created_at: string
          derived_artifact_id: string | null
          filename: string
          id: string
          idempotency_key: string
          original_artifact_id: string | null
          original_checksum: string | null
          page_count: number | null
          provenance: Json
          quality_gate: Json
          resulting_state_evidence: Json
          selected_pages: Json
          selected_projects: Json
          submission_method: string
          submission_url: string | null
          size_bytes: number | null
          transformations: Json
          updated_at: string
          upload_state: string
          user_id: string
          word_count: number | null
          work_sample_requirement_id: string
        }
        Insert: {
          application_case_id: string
          approval_state?: string
          artifact_type: string
          candidate_id?: string | null
          checksum: string
          created_at?: string
          derived_artifact_id?: string | null
          filename: string
          id?: string
          idempotency_key: string
          original_artifact_id?: string | null
          original_checksum?: string | null
          page_count?: number | null
          provenance?: Json
          quality_gate?: Json
          resulting_state_evidence?: Json
          selected_pages?: Json
          selected_projects?: Json
          submission_method?: string
          submission_url?: string | null
          size_bytes?: number | null
          transformations?: Json
          updated_at?: string
          upload_state?: string
          user_id: string
          word_count?: number | null
          work_sample_requirement_id: string
        }
        Update: {
          application_case_id?: string
          approval_state?: string
          artifact_type?: string
          candidate_id?: string | null
          checksum?: string
          created_at?: string
          derived_artifact_id?: string | null
          filename?: string
          id?: string
          idempotency_key?: string
          original_artifact_id?: string | null
          original_checksum?: string | null
          page_count?: number | null
          provenance?: Json
          quality_gate?: Json
          resulting_state_evidence?: Json
          selected_pages?: Json
          selected_projects?: Json
          submission_method?: string
          submission_url?: string | null
          size_bytes?: number | null
          transformations?: Json
          updated_at?: string
          upload_state?: string
          user_id?: string
          word_count?: number | null
          work_sample_requirement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_work_sample_submissions_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_work_sample_submissions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "application_work_sample_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_work_sample_submissions_derived_artifact_id_fkey"
            columns: ["derived_artifact_id"]
            isOneToOne: false
            referencedRelation: "application_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_work_sample_submissions_original_artifact_id_fkey"
            columns: ["original_artifact_id"]
            isOneToOne: false
            referencedRelation: "application_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_work_sample_submissions_work_sample_requirement_id_fkey"
            columns: ["work_sample_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_work_sample_requirements"
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
      application_fee_audit_events: {
        Row: {
          application_case_id: string
          created_at: string
          event_type: string
          fee_requirement_id: string
          id: string
          idempotency_key: string
          non_sensitive_data: Json
          user_id: string
        }
        Insert: {
          application_case_id: string
          created_at?: string
          event_type: string
          fee_requirement_id: string
          id?: string
          idempotency_key: string
          non_sensitive_data?: Json
          user_id: string
        }
        Update: {
          application_case_id?: string
          created_at?: string
          event_type?: string
          fee_requirement_id?: string
          id?: string
          idempotency_key?: string
          non_sensitive_data?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_fee_audit_events_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_audit_events_fee_requirement_id_fkey"
            columns: ["fee_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_fee_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      application_fee_interactions: {
        Row: {
          application_case_id: string
          created_at: string
          deadline: string | null
          exact_amount: Json | null
          fee_requirement_id: string
          id: string
          idempotency_key: string
          interaction_key: string
          interaction_kind: string
          known_context: Json
          options: Json
          question: string
          reason: string
          response: Json | null
          sensitive: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          created_at?: string
          deadline?: string | null
          exact_amount?: Json | null
          fee_requirement_id: string
          id?: string
          idempotency_key: string
          interaction_key: string
          interaction_kind: string
          known_context?: Json
          options?: Json
          question: string
          reason?: string
          response?: Json | null
          sensitive?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          created_at?: string
          deadline?: string | null
          exact_amount?: Json | null
          fee_requirement_id?: string
          id?: string
          idempotency_key?: string
          interaction_key?: string
          interaction_kind?: string
          known_context?: Json
          options?: Json
          question?: string
          reason?: string
          response?: Json | null
          sensitive?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_fee_interactions_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_interactions_fee_requirement_id_fkey"
            columns: ["fee_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_fee_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      application_fee_payment_attempts: {
        Row: {
          application_case_id: string
          authorization_id: string
          claimed_at: string
          completed_at: string | null
          created_at: string
          fee_requirement_id: string
          id: string
          idempotency_key: string
          lock_owner: string | null
          locked_at: string
          provider_transaction_id: string | null
          state: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          authorization_id: string
          claimed_at?: string
          completed_at?: string | null
          created_at?: string
          fee_requirement_id: string
          id?: string
          idempotency_key: string
          lock_owner?: string | null
          locked_at?: string
          provider_transaction_id?: string | null
          state?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          authorization_id?: string
          claimed_at?: string
          completed_at?: string | null
          created_at?: string
          fee_requirement_id?: string
          id?: string
          idempotency_key?: string
          lock_owner?: string | null
          locked_at?: string
          provider_transaction_id?: string | null
          state?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_fee_payment_attempts_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_payment_attempts_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "application_fee_payment_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_payment_attempts_fee_requirement_id_fkey"
            columns: ["fee_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_fee_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      application_fee_payment_authorizations: {
        Row: {
          amount: number
          application_case_id: string
          authorization_key: string
          authorized_at: string
          created_at: string
          currency: string
          expires_at: string
          fee_requirement_id: string
          id: string
          idempotency_key: string
          maximum_authorized_amount: number
          merchant: string
          reason: string
          requirement_version: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          application_case_id: string
          authorization_key: string
          authorized_at?: string
          created_at?: string
          currency: string
          expires_at: string
          fee_requirement_id: string
          id?: string
          idempotency_key: string
          maximum_authorized_amount: number
          merchant?: string
          reason?: string
          requirement_version: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          application_case_id?: string
          authorization_key?: string
          authorized_at?: string
          created_at?: string
          currency?: string
          expires_at?: string
          fee_requirement_id?: string
          id?: string
          idempotency_key?: string
          maximum_authorized_amount?: number
          merchant?: string
          reason?: string
          requirement_version?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_fee_payment_authorizations_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_payment_authorizations_fee_requirement_id_fkey"
            columns: ["fee_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_fee_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      application_fee_payment_evidence: {
        Row: {
          amount: number
          application_case_id: string
          checksum: string | null
          created_at: string
          currency: string
          evidence_source: string
          fee_requirement_id: string
          id: string
          institution: string
          payment_date_time: string
          portal_state: string
          provider: string | null
          receipt_artifact_id: string | null
          receipt_number: string | null
          source_evidence_ids: string[]
          transaction_id: string | null
          user_id: string
          metadata: Json
        }
        Insert: {
          amount: number
          application_case_id: string
          checksum?: string | null
          created_at?: string
          currency: string
          evidence_source: string
          fee_requirement_id: string
          id?: string
          institution?: string
          payment_date_time: string
          portal_state: string
          provider?: string | null
          receipt_artifact_id?: string | null
          receipt_number?: string | null
          source_evidence_ids?: string[]
          transaction_id?: string | null
          user_id: string
          metadata?: Json
        }
        Update: {
          amount?: number
          application_case_id?: string
          checksum?: string | null
          created_at?: string
          currency?: string
          evidence_source?: string
          fee_requirement_id?: string
          id?: string
          institution?: string
          payment_date_time?: string
          portal_state?: string
          provider?: string | null
          receipt_artifact_id?: string | null
          receipt_number?: string | null
          source_evidence_ids?: string[]
          transaction_id?: string | null
          user_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "application_fee_payment_evidence_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_payment_evidence_fee_requirement_id_fkey"
            columns: ["fee_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_fee_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_payment_evidence_receipt_artifact_id_fkey"
            columns: ["receipt_artifact_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      application_fee_requirements: {
        Row: {
          amount_retrieved_at: string | null
          application_case_id: string
          application_cycle: string
          blocker: string | null
          campaign_id: string | null
          created_at: string
          currency: string | null
          deadline_timezone: string | null
          fee_amount: number | null
          fee_required: boolean | null
          id: string
          institution: string
          programme: string
          payment_deadline: string | null
          payment_method: string | null
          payment_stage: string
          payment_state: string
          processing_service_fee: number | null
          provider_portal_transaction_id: string | null
          receipt_artifact_id: string | null
          requirement_key: string
          risk_state: string
          source_provenance: Json
          total_payable: number | null
          task_id: string | null
          updated_at: string
          user_id: string
          verification_evidence_ids: string[]
          version: number
          waiver_availability: string
          waiver_code: string | null
          waiver_deadline: string | null
          waiver_decision_state: string
          waiver_eligibility_state: string
          waiver_evidence_requirements: Json
          waiver_submission_method: string | null
          waiver_type: string | null
          workflow: Json
        }
        Insert: {
          amount_retrieved_at?: string | null
          application_case_id: string
          application_cycle?: string
          blocker?: string | null
          campaign_id?: string | null
          created_at?: string
          currency?: string | null
          deadline_timezone?: string | null
          fee_amount?: number | null
          fee_required?: boolean | null
          id?: string
          institution?: string
          programme?: string
          payment_deadline?: string | null
          payment_method?: string | null
          payment_stage?: string
          payment_state?: string
          processing_service_fee?: number | null
          provider_portal_transaction_id?: string | null
          receipt_artifact_id?: string | null
          requirement_key: string
          risk_state?: string
          source_provenance?: Json
          total_payable?: number | null
          task_id?: string | null
          updated_at?: string
          user_id: string
          verification_evidence_ids?: string[]
          version?: number
          waiver_availability?: string
          waiver_code?: string | null
          waiver_deadline?: string | null
          waiver_decision_state?: string
          waiver_eligibility_state?: string
          waiver_evidence_requirements?: Json
          waiver_submission_method?: string | null
          waiver_type?: string | null
          workflow?: Json
        }
        Update: {
          amount_retrieved_at?: string | null
          application_case_id?: string
          application_cycle?: string
          blocker?: string | null
          campaign_id?: string | null
          created_at?: string
          currency?: string | null
          deadline_timezone?: string | null
          fee_amount?: number | null
          fee_required?: boolean | null
          id?: string
          institution?: string
          programme?: string
          payment_deadline?: string | null
          payment_method?: string | null
          payment_stage?: string
          payment_state?: string
          processing_service_fee?: number | null
          provider_portal_transaction_id?: string | null
          receipt_artifact_id?: string | null
          requirement_key?: string
          risk_state?: string
          source_provenance?: Json
          total_payable?: number | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
          verification_evidence_ids?: string[]
          version?: number
          waiver_availability?: string
          waiver_code?: string | null
          waiver_deadline?: string | null
          waiver_decision_state?: string
          waiver_eligibility_state?: string
          waiver_evidence_requirements?: Json
          waiver_submission_method?: string | null
          waiver_type?: string | null
          workflow?: Json
        }
        Relationships: [
          {
            foreignKeyName: "application_fee_requirements_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_requirements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "application_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_requirements_receipt_artifact_id_fkey"
            columns: ["receipt_artifact_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_fee_requirements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_post_submission_requests: {
        Row: {
          acceptance_evidence: string[]
          applicant_action_required: boolean
          application_case_id: string
          artifact_candidates: string[]
          campaign_id: string | null
          certified_translation_required: boolean
          created_at: string
          deadline_at: string | null
          deadline_timezone: string | null
          degree_conferral_required: boolean
          exact_request_text: string
          external_commitment_due_at: string | null
          final_version_required: boolean
          history: Json
          id: string
          idempotency_key: string
          institution: string
          institution_direct_delivery_required: boolean
          normalized_requirement: string
          programme: string
          requirement_id: string | null
          recipient: string | null
          rejection_reason: string | null
          request_type: string
          requested_artifact_data_type: string | null
          response_evidence: string[]
          source_message_id: string
          source_provider: string
          source_thread_id: string | null
          source_url: string | null
          status: string
          submission_method: string
          task_id: string | null
          translation_required: boolean
          updated_at: string
          urgency: string
          user_id: string
          version: number
          official_status_required: boolean
        }
        Insert: {
          acceptance_evidence?: string[]
          applicant_action_required?: boolean
          application_case_id: string
          artifact_candidates?: string[]
          campaign_id?: string | null
          certified_translation_required?: boolean
          created_at?: string
          deadline_at?: string | null
          deadline_timezone?: string | null
          degree_conferral_required?: boolean
          exact_request_text: string
          external_commitment_due_at?: string | null
          final_version_required?: boolean
          history?: Json
          id?: string
          idempotency_key: string
          institution: string
          institution_direct_delivery_required?: boolean
          normalized_requirement: string
          programme: string
          requirement_id?: string | null
          recipient?: string | null
          rejection_reason?: string | null
          request_type: string
          requested_artifact_data_type?: string | null
          response_evidence?: string[]
          source_message_id: string
          source_provider: string
          source_thread_id?: string | null
          source_url?: string | null
          status?: string
          submission_method?: string
          task_id?: string | null
          translation_required?: boolean
          updated_at?: string
          urgency?: string
          user_id: string
          version?: number
          official_status_required?: boolean
        }
        Update: {
          acceptance_evidence?: string[]
          applicant_action_required?: boolean
          application_case_id?: string
          artifact_candidates?: string[]
          campaign_id?: string | null
          certified_translation_required?: boolean
          created_at?: string
          deadline_at?: string | null
          deadline_timezone?: string | null
          degree_conferral_required?: boolean
          exact_request_text?: string
          external_commitment_due_at?: string | null
          final_version_required?: boolean
          history?: Json
          id?: string
          idempotency_key?: string
          institution?: string
          institution_direct_delivery_required?: boolean
          normalized_requirement?: string
          programme?: string
          requirement_id?: string | null
          recipient?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_artifact_data_type?: string | null
          response_evidence?: string[]
          source_message_id?: string
          source_provider?: string
          source_thread_id?: string | null
          source_url?: string | null
          status?: string
          submission_method?: string
          task_id?: string | null
          translation_required?: boolean
          updated_at?: string
          urgency?: string
          user_id?: string
          version?: number
          official_status_required?: boolean
        }
        Relationships: []
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
      application_outreach_packages: {
        Row: {
          application_case_id: string
          approved_cv_artifact_id: string | null
          approved_cv_checksum: string | null
          approved_email_version: string | null
          contact_id: string | null
          contact_mode: string
          created_at: string
          id: string
          idempotency_key: string
          opportunity_id: string
          package_data: Json
          quality_metadata: Json
          sent_message_id: string | null
          sent_thread_id: string | null
          status: string
          supervisor_id: string
          updated_at: string
          user_approval: boolean
          user_approved_at: string | null
          user_id: string
          verified_email: string
        }
        Insert: {
          application_case_id: string
          approved_cv_artifact_id?: string | null
          approved_cv_checksum?: string | null
          approved_email_version?: string | null
          contact_id?: string | null
          contact_mode?: string
          created_at?: string
          id?: string
          idempotency_key: string
          opportunity_id: string
          package_data: Json
          quality_metadata?: Json
          sent_message_id?: string | null
          sent_thread_id?: string | null
          status?: string
          supervisor_id: string
          updated_at?: string
          user_approval?: boolean
          user_approved_at?: string | null
          user_id: string
          verified_email: string
        }
        Update: {
          application_case_id?: string
          approved_cv_artifact_id?: string | null
          approved_cv_checksum?: string | null
          approved_email_version?: string | null
          contact_id?: string | null
          contact_mode?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          opportunity_id?: string
          package_data?: Json
          quality_metadata?: Json
          sent_message_id?: string | null
          sent_thread_id?: string | null
          status?: string
          supervisor_id?: string
          updated_at?: string
          user_approval?: boolean
          user_approved_at?: string | null
          user_id?: string
          verified_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_outreach_packages_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outreach_packages_approved_cv_artifact_id_fkey"
            columns: ["approved_cv_artifact_id"]
            isOneToOne: false
            referencedRelation: "application_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outreach_packages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "application_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outreach_packages_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "application_opportunities"
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
          dependency_ids: string[]
          evidence_contract: Json
          required: boolean
          requirement_type: string | null
          resolution_tier: number | null
          retry_state: Json
          responsible_party: string
          source: Json | null
          source_id: string | null
          status: string
          updated_at: string
          user_id: string
          verification_evidence_ids: string[]
          wait_until: string | null
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
          dependency_ids?: string[]
          evidence_contract?: Json
          required?: boolean
          requirement_type?: string | null
          resolution_tier?: number | null
          retry_state?: Json
          responsible_party?: string
          source?: Json | null
          source_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verification_evidence_ids?: string[]
          wait_until?: string | null
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
          dependency_ids?: string[]
          evidence_contract?: Json
          required?: boolean
          requirement_type?: string | null
          resolution_tier?: number | null
          retry_state?: Json
          responsible_party?: string
          source?: Json | null
          source_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verification_evidence_ids?: string[]
          wait_until?: string | null
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
      application_questions: {
        Row: {
          answer_route: string | null
          answer_strategy: Json | null
          answer_value: string | null
          application_case_id: string
          application_requirement_id: string | null
          approval_requirement: string
          artifact_dependencies: string[]
          checkpoint_id: string | null
          conditional_trigger: string | null
          created_at: string
          current_value: Json | null
          exact_prompt: string
          evidence_dependencies: string[]
          id: string
          input_type: string
          last_error: string | null
          maximum: number | null
          minimum: number | null
          normalized_prompt: string
          options: Json
          portal: string
          portal_section: string
          question_key: string
          question_type: string
          required: boolean
          retry_state: Json
          saved_state_evidence: Json | null
          source: Json
          status: string
          unit: string | null
          updated_at: string
          user_id: string
          validation_rule: string | null
          writer_dependencies: string[]
        }
        Insert: {
          answer_route?: string | null
          answer_strategy?: Json | null
          answer_value?: string | null
          application_case_id: string
          application_requirement_id?: string | null
          approval_requirement?: string
          artifact_dependencies?: string[]
          checkpoint_id?: string | null
          conditional_trigger?: string | null
          created_at?: string
          current_value?: Json | null
          exact_prompt: string
          evidence_dependencies?: string[]
          id?: string
          input_type: string
          last_error?: string | null
          maximum?: number | null
          minimum?: number | null
          normalized_prompt: string
          options?: Json
          portal: string
          portal_section: string
          question_key: string
          question_type: string
          required?: boolean
          retry_state?: Json
          saved_state_evidence?: Json | null
          source?: Json
          status?: string
          unit?: string | null
          updated_at?: string
          user_id: string
          validation_rule?: string | null
          writer_dependencies?: string[]
        }
        Update: {
          answer_route?: string | null
          answer_strategy?: Json | null
          answer_value?: string | null
          application_case_id?: string
          application_requirement_id?: string | null
          approval_requirement?: string
          artifact_dependencies?: string[]
          checkpoint_id?: string | null
          conditional_trigger?: string | null
          created_at?: string
          current_value?: Json | null
          exact_prompt?: string
          evidence_dependencies?: string[]
          id?: string
          input_type?: string
          last_error?: string | null
          maximum?: number | null
          minimum?: number | null
          normalized_prompt?: string
          options?: Json
          portal?: string
          portal_section?: string
          question_key?: string
          question_type?: string
          required?: boolean
          retry_state?: Json
          saved_state_evidence?: Json | null
          source?: Json
          status?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
          validation_rule?: string | null
          writer_dependencies?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "application_questions_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_questions_application_requirement_id_fkey"
            columns: ["application_requirement_id"]
            isOneToOne: false
            referencedRelation: "application_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_questions_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "portal_checkpoints"
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
      notification_preferences: {
        Row: {
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          timezone: string
          updated_at: string
          user_id: string
          web_push_enabled: boolean
        }
        Insert: {
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
          web_push_enabled?: boolean
        }
        Update: {
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
          created_at: string
          dark_mode: boolean
          display_name: string
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string
          created_at?: string
          dark_mode?: boolean
          display_name?: string
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string
          created_at?: string
          dark_mode?: boolean
          display_name?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
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
      scheduled_push_deliveries: {
        Row: {
          attempt_count: number
          claim_token: string | null
          claimed_at: string | null
          delivered_at: string | null
          delivery_key: string
          last_error: string | null
          push_subscription_id: string
          status: string
        }
        Insert: {
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string | null
          delivered_at?: string | null
          delivery_key: string
          last_error?: string | null
          push_subscription_id: string
          status?: string
        }
        Update: {
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string | null
          delivered_at?: string | null
          delivery_key?: string
          last_error?: string | null
          push_subscription_id?: string
          status?: string
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
          id: string
          last_carry_reason: string
          position: number
          priority: string
          recurrence: string
          title: string
          top_three: boolean
          updated_at: string
          user_id: string
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
          id?: string
          last_carry_reason?: string
          position?: number
          priority?: string
          recurrence?: string
          title: string
          top_three?: boolean
          updated_at?: string
          user_id: string
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
          id?: string
          last_carry_reason?: string
          position?: number
          priority?: string
          recurrence?: string
          title?: string
          top_three?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      academic_evidence_requirements: {
        Row: {
          accepted_evidence_types: Json
          application_case_id: string
          approval_requirement: string
          blocker: string | null
          completion_evidence: Json
          confidence: string
          cost: Json | null
          created_at: string
          current_artifact_ids: string[]
          deadline_at: string | null
          deadline_timezone: string | null
          dependency_ids: string[]
          exact_rule: Json
          external_provider: Json | null
          id: string
          idempotency_key: string
          institution: string
          programme: string
          requirement_key: string
          requirement_type: string
          requiredness: string
          source_evidence: Json
          stage: string
          status: string
          submission_method: Json
          updated_at: string
          user_id: string
          official_status: string
        }
        Insert: {
          accepted_evidence_types?: Json
          application_case_id: string
          approval_requirement?: string
          blocker?: string | null
          completion_evidence?: Json
          confidence?: string
          cost?: Json | null
          created_at?: string
          current_artifact_ids?: string[]
          deadline_at?: string | null
          deadline_timezone?: string | null
          dependency_ids?: string[]
          exact_rule?: Json
          external_provider?: Json | null
          id?: string
          idempotency_key: string
          institution: string
          programme: string
          requirement_key: string
          requirement_type: string
          requiredness: string
          source_evidence?: Json
          stage: string
          status?: string
          submission_method?: Json
          updated_at?: string
          user_id: string
          official_status: string
        }
        Update: {
          accepted_evidence_types?: Json
          application_case_id?: string
          approval_requirement?: string
          blocker?: string | null
          completion_evidence?: Json
          confidence?: string
          cost?: Json | null
          created_at?: string
          current_artifact_ids?: string[]
          deadline_at?: string | null
          deadline_timezone?: string | null
          dependency_ids?: string[]
          exact_rule?: Json
          external_provider?: Json | null
          id?: string
          idempotency_key?: string
          institution?: string
          programme?: string
          requirement_key?: string
          requirement_type?: string
          requiredness?: string
          source_evidence?: Json
          stage?: string
          status?: string
          submission_method?: Json
          updated_at?: string
          user_id?: string
          official_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_evidence_requirements_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_evidence_deliveries: {
        Row: {
          application_case_id: string
          blocker: string | null
          commitment_at: string | null
          commitment_due_at: string | null
          created_at: string
          delivery_key: string
          delivery_type: string
          evidence: Json
          id: string
          idempotency_key: string
          provider: string | null
          provider_id: string | null
          recipient: string | null
          requirement_key: string
          retry_state: Json
          state: string
          tracking_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_case_id: string
          blocker?: string | null
          commitment_at?: string | null
          commitment_due_at?: string | null
          created_at?: string
          delivery_key: string
          delivery_type: string
          evidence?: Json
          id?: string
          idempotency_key: string
          provider?: string | null
          provider_id?: string | null
          recipient?: string | null
          requirement_key: string
          retry_state?: Json
          state?: string
          tracking_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_case_id?: string
          blocker?: string | null
          commitment_at?: string | null
          commitment_due_at?: string | null
          created_at?: string
          delivery_key?: string
          delivery_type?: string
          evidence?: Json
          id?: string
          idempotency_key?: string
          provider?: string | null
          provider_id?: string | null
          recipient?: string | null
          requirement_key?: string
          retry_state?: Json
          state?: string
          tracking_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_evidence_deliveries_application_case_id_fkey"
            columns: ["application_case_id"]
            isOneToOne: false
            referencedRelation: "application_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_evaluation_cases: {
        Row: {
          application_case_ids: string[]
          blocker: string | null
          cost: Json | null
          created_at: string
          deadline_at: string | null
          evaluation_key: string
          evaluation_type: string
          expected_processing_time: string | null
          id: string
          idempotency_key: string
          institution_deliveries: Json
          provider: string
          recipient_institutions: string[]
          reference_number: string | null
          report_dispatch_state: string
          report_id: string | null
          required_delivery_route: string
          required_documents: string[]
          requirement_keys: string[]
          source_evidence: Json
          state: string
          translation_rules: string[]
          university_receipt_states: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          application_case_ids?: string[]
          blocker?: string | null
          cost?: Json | null
          created_at?: string
          deadline_at?: string | null
          evaluation_key: string
          evaluation_type: string
          expected_processing_time?: string | null
          id?: string
          idempotency_key: string
          institution_deliveries?: Json
          provider: string
          recipient_institutions?: string[]
          reference_number?: string | null
          report_dispatch_state?: string
          report_id?: string | null
          required_delivery_route?: string
          required_documents?: string[]
          requirement_keys?: string[]
          source_evidence?: Json
          state?: string
          translation_rules?: string[]
          university_receipt_states?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          application_case_ids?: string[]
          blocker?: string | null
          cost?: Json | null
          created_at?: string
          deadline_at?: string | null
          evaluation_key?: string
          evaluation_type?: string
          expected_processing_time?: string | null
          id?: string
          idempotency_key?: string
          institution_deliveries?: Json
          provider?: string
          recipient_institutions?: string[]
          reference_number?: string | null
          report_dispatch_state?: string
          report_id?: string | null
          required_delivery_route?: string
          required_documents?: string[]
          requirement_keys?: string[]
          source_evidence?: Json
          state?: string
          translation_rules?: string[]
          university_receipt_states?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      language_test_attempts: {
        Row: {
          candidate_or_report_number: string | null
          created_at: string
          id: string
          attempt_key: string
          official_report_state: string
          overall_score: number | null
          provider: string
          provenance: Json
          recipients: Json
          score_report_artifact_id: string | null
          section_scores: Json
          test_date: string
          test_type: string
          test_version: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          candidate_or_report_number?: string | null
          created_at?: string
          id?: string
          attempt_key: string
          official_report_state?: string
          overall_score?: number | null
          provider: string
          provenance?: Json
          recipients?: Json
          score_report_artifact_id?: string | null
          section_scores?: Json
          test_date: string
          test_type: string
          test_version?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          candidate_or_report_number?: string | null
          created_at?: string
          id?: string
          attempt_key?: string
          official_report_state?: string
          overall_score?: number | null
          provider?: string
          provenance?: Json
          recipients?: Json
          score_report_artifact_id?: string | null
          section_scores?: Json
          test_date?: string
          test_type?: string
          test_version?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      admissions_test_attempts: {
        Row: {
          attempt_key: string
          candidate_or_report_number: string | null
          composite_score: number | null
          created_at: string
          id: string
          official_report_state: string
          overall_score: number | null
          percentile: number | null
          provenance: Json
          recipients: Json
          score_artifact_id: string | null
          section_scores: Json
          test_date: string
          test_type: string
          updated_at: string
          user_id: string
          valid_until: string | null
          writing_score: number | null
        }
        Insert: {
          attempt_key: string
          candidate_or_report_number?: string | null
          composite_score?: number | null
          created_at?: string
          id?: string
          official_report_state?: string
          overall_score?: number | null
          percentile?: number | null
          provenance?: Json
          recipients?: Json
          score_artifact_id?: string | null
          section_scores?: Json
          test_date: string
          test_type: string
          updated_at?: string
          user_id: string
          valid_until?: string | null
          writing_score?: number | null
        }
        Update: {
          attempt_key?: string
          candidate_or_report_number?: string | null
          composite_score?: number | null
          created_at?: string
          id?: string
          official_report_state?: string
          overall_score?: number | null
          percentile?: number | null
          provenance?: Json
          recipients?: Json
          score_artifact_id?: string | null
          section_scores?: Json
          test_date?: string
          test_type?: string
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          writing_score?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_ai_coach_usage: {
        Args: { p_user_id: string }
        Returns: number
      }
      claim_push_delivery: {
        Args: {
          p_delivery_key: string
          p_kind: string
          p_lease_seconds?: number
          p_subscription_id: string
        }
        Returns: string | null
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
      claim_application_fee_payment: {
        Args: {
          p_authorization_id: string
          p_case_id: string
          p_fee_requirement_id: string
          p_idempotency_key: string
          p_lock_owner: string
          p_user_id: string
        }
        Returns: Json
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
      finish_push_delivery: {
        Args: {
          p_claim_token: string
          p_delivered: boolean
          p_delivery_key: string
          p_error_code?: string | null
          p_kind: string
          p_retryable?: boolean
          p_subscription_id: string
        }
        Returns: boolean
      }
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
