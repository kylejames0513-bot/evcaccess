export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "admin" | "coordinator" | "viewer";
export type NotificationStatus = "pending" | "sent" | "failed";

// Kept for backward compat with old pages that haven't been updated yet
export type EmployeeStatus = "active" | "on_leave" | "terminated";
export type CompletionSource = "signin" | "import_paylocity" | "import_phs" | "import_evc_training" | "manual" | "class_roster";
export type ClassStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type EnrollmentPriority = "expired" | "never_completed" | "expiring_soon" | "refresher";
export type PassFail = "pass" | "fail" | "no_show";
export type ImportSource = "paylocity" | "phs" | "manual_csv" | "evc_training_xlsx" | "evc_merged_employees_xlsx";
export type ImportRunStatus = "running" | "success" | "partial" | "failed";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; slug: string; regulator: string; fiscal_year_start_month: number; logo_storage_path: string | null; primary_color: string | null; paylocity_field_map: Json; phs_field_map: Json; memo_signoff: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; name: string; slug: string; regulator?: string; fiscal_year_start_month?: number; logo_storage_path?: string | null; primary_color?: string | null; paylocity_field_map?: Json; phs_field_map?: Json; memo_signoff?: string | null; };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; org_id: string | null; full_name: string; role: AppRole; created_at: string; updated_at: string; };
        Insert: { id: string; org_id?: string | null; full_name?: string; role?: AppRole; };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: { id: string; employee_id: string; legal_last_name: string; legal_first_name: string; preferred_name: string | null; known_aliases: string[]; email: string | null; phone: string | null; position: string | null; department: string | null; location: string | null; supervisor_id: string | null; supervisor_name_raw: string | null; status: string; hire_date: string | null; termination_date: string | null; source: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; employee_id: string; legal_last_name: string; legal_first_name: string; preferred_name?: string | null; known_aliases?: string[]; email?: string | null; phone?: string | null; position?: string | null; department?: string | null; location?: string | null; supervisor_id?: string | null; supervisor_name_raw?: string | null; status?: string; hire_date?: string | null; termination_date?: string | null; source?: string | null; };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      trainings: {
        Row: { id: string; code: string; title: string; description: string | null; category: string | null; regulatory_citation: string | null; cadence_type: string; cadence_months: number | null; grace_days: number; delivery_mode: string | null; materials_url: string | null; active: boolean; created_at: string; updated_at: string; };
        Insert: { id?: string; code: string; title: string; description?: string | null; category?: string | null; regulatory_citation?: string | null; cadence_type?: string; cadence_months?: number | null; grace_days?: number; delivery_mode?: string | null; materials_url?: string | null; active?: boolean; };
        Update: Partial<Database["public"]["Tables"]["trainings"]["Insert"]>;
        Relationships: [];
      };
      requirements: {
        Row: { id: string; training_id: string; role: string | null; department: string | null; required_within_days_of_hire: number | null; created_at: string; };
        Insert: { id?: string; training_id: string; role?: string | null; department?: string | null; required_within_days_of_hire?: number | null; };
        Update: Partial<Database["public"]["Tables"]["requirements"]["Insert"]>;
        Relationships: [];
      };
      completions: {
        Row: { id: string; employee_id: string; training_id: string; completed_on: string | null; expires_on: string | null; status: string; exempt_reason: string | null; source: string | null; source_row_hash: string | null; notes: string | null; certificate_url: string | null; session_id: string | null; created_at: string; };
        Insert: { id?: string; employee_id: string; training_id: string; completed_on?: string | null; status?: string; exempt_reason?: string | null; source?: string | null; source_row_hash?: string | null; notes?: string | null; certificate_url?: string | null; session_id?: string | null; };
        Update: Partial<Database["public"]["Tables"]["completions"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: { id: string; training_id: string; scheduled_start: string | null; scheduled_end: string | null; location: string | null; trainer_name: string | null; capacity: number | null; status: string; title: string | null; session_kind: string | null; notes: string | null; created_at: string; };
        Insert: { id?: string; training_id: string; scheduled_start?: string | null; scheduled_end?: string | null; location?: string | null; trainer_name?: string | null; capacity?: number | null; status?: string; title?: string | null; session_kind?: string | null; notes?: string | null; };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      session_enrollments: {
        Row: { id: string; session_id: string; employee_id: string; source: string | null; status: string | null; enrolled_at: string | null; enrolled_by: string | null; attendance_marked_at: string | null; attendance_marked_by: string | null; completion_id: string | null; notes: string | null; };
        Insert: { id?: string; session_id: string; employee_id: string; source?: string | null; status?: string | null; enrolled_at?: string | null; enrolled_by?: string | null; attendance_marked_at?: string | null; attendance_marked_by?: string | null; completion_id?: string | null; notes?: string | null; };
        Update: Partial<Database["public"]["Tables"]["session_enrollments"]["Insert"]>;
        Relationships: [];
      };
      memo_templates: {
        Row: { id: string; slug: string; name: string; subject_template: string; body_template: string; active: boolean; is_default: boolean; created_at: string; updated_at: string; };
        Insert: { id?: string; slug: string; name: string; subject_template: string; body_template: string; active?: boolean; is_default?: boolean; };
        Update: Partial<Database["public"]["Tables"]["memo_templates"]["Insert"]>;
        Relationships: [];
      };
      sync_failures: {
        Row: { id: string; kind: string; target: string; payload: Json; error: string | null; attempts: number; created_at: string; last_attempt_at: string; resolved: boolean; resolved_at: string | null; resolved_by: string | null; resolution_notes: string | null; };
        Insert: { id?: string; kind: string; target: string; payload: Json; error?: string | null; attempts?: number; last_attempt_at?: string; resolved?: boolean; resolved_at?: string | null; resolved_by?: string | null; resolution_notes?: string | null; };
        Update: Partial<Database["public"]["Tables"]["sync_failures"]["Insert"]>;
        Relationships: [];
      };
      pending_xlsx_writes: {
        Row: { id: string; source: string; action: string; payload: Json; created_at: string; applied_at: string | null; applied_by: string | null; error: string | null; };
        Insert: { id?: string; source: string; action: string; payload: Json; applied_at?: string | null; applied_by?: string | null; error?: string | null; };
        Update: Partial<Database["public"]["Tables"]["pending_xlsx_writes"]["Insert"]>;
        Relationships: [];
      };
      new_hires: {
        Row: { id: string; employee_id: string | null; legal_last_name: string; legal_first_name: string; preferred_name: string | null; position: string | null; department: string | null; supervisor_id: string | null; supervisor_name_raw: string | null; offer_accepted_date: string | null; planned_start_date: string | null; actual_start_date: string | null; source: string | null; recruiter: string | null; stage: string; stage_entry_date: string | null; probation_end_date: string | null; hire_month: string | null; hire_year: number | null; ingest_source: string | null; hire_type: string | null; is_residential: boolean | null; lift_van_required: boolean | null; new_job_desc_required: boolean | null; background_check: string | null; assigned_date: string | null; relias: string | null; three_phase: string | null; job_desc: string | null; location_title: string | null; cpr_status: string | null; med_cert_status: string | null; ukeru_status: string | null; mealtime_status: string | null; lift_van_status: string | null; therapy_status: string | null; itsp_status: string | null; delegation_status: string | null; transfer_from: string | null; transfer_to: string | null; mcf_received_date: string | null; effective_date: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; legal_last_name: string; legal_first_name: string; preferred_name?: string | null; position?: string | null; department?: string | null; supervisor_id?: string | null; supervisor_name_raw?: string | null; planned_start_date?: string | null; offer_accepted_date?: string | null; actual_start_date?: string | null; source?: string | null; recruiter?: string | null; stage?: string; stage_entry_date?: string | null; probation_end_date?: string | null; hire_month?: string | null; hire_year?: number | null; ingest_source?: string | null; hire_type?: string | null; is_residential?: boolean | null; lift_van_required?: boolean | null; new_job_desc_required?: boolean | null; background_check?: string | null; assigned_date?: string | null; relias?: string | null; three_phase?: string | null; job_desc?: string | null; location_title?: string | null; cpr_status?: string | null; med_cert_status?: string | null; ukeru_status?: string | null; mealtime_status?: string | null; lift_van_status?: string | null; therapy_status?: string | null; itsp_status?: string | null; delegation_status?: string | null; transfer_from?: string | null; transfer_to?: string | null; mcf_received_date?: string | null; effective_date?: string | null; };
        Update: Partial<Database["public"]["Tables"]["new_hires"]["Insert"]>;
        Relationships: [];
      };
      separations: {
        Row: { id: string; employee_id: string | null; legal_name: string; position: string | null; department: string | null; supervisor_id: string | null; supervisor_name_raw: string | null; hire_date: string | null; separation_date: string; tenure_days: number | null; separation_type: string | null; reason_primary: string | null; reason_secondary: string | null; rehire_eligible: string | null; rehire_notes: string | null; exit_interview_status: string; exit_interview_doc_url: string | null; final_pay_date: string | null; pto_payout: number | null; benefits_term_date: string | null; cobra_mailed_date: string | null; hr_notes: string | null; calendar_year: number | null; evc_fiscal_year: number | null; ingest_source: string | null; created_at: string; };
        Insert: { id?: string; legal_name: string; separation_date: string; position?: string | null; department?: string | null; supervisor_name_raw?: string | null; hire_date?: string | null; separation_type?: string | null; reason_primary?: string | null; reason_secondary?: string | null; rehire_eligible?: string | null; rehire_notes?: string | null; exit_interview_status?: string; final_pay_date?: string | null; pto_payout?: number | null; benefits_term_date?: string | null; cobra_mailed_date?: string | null; hr_notes?: string | null; ingest_source?: string | null; };
        Update: Partial<Database["public"]["Tables"]["separations"]["Insert"]>;
        Relationships: [];
      };
      ingestion_runs: {
        Row: { id: string; source: string; started_at: string; finished_at: string | null; status: string | null; rows_processed: number; rows_inserted: number; rows_updated: number; rows_skipped: number; rows_unresolved: number; error_summary: string | null; triggered_by: string | null; };
        Insert: { id?: string; source: string; status?: string | null; rows_processed?: number; rows_inserted?: number; rows_updated?: number; rows_skipped?: number; rows_unresolved?: number; error_summary?: string | null; triggered_by?: string | null; finished_at?: string | null; };
        Update: Partial<Database["public"]["Tables"]["ingestion_runs"]["Insert"]>;
        Relationships: [];
      };
      review_queue: {
        Row: { id: string; ingestion_run_id: string | null; source: string | null; reason: string | null; raw_payload: Json | null; suggested_match_employee_id: string | null; suggested_match_score: number | null; resolved: boolean; resolved_at: string | null; resolved_by: string | null; resolution_notes: string | null; created_at: string; };
        Insert: { id?: string; ingestion_run_id?: string | null; source?: string | null; reason?: string | null; raw_payload?: Json | null; suggested_match_employee_id?: string | null; suggested_match_score?: number | null; resolved?: boolean; resolved_at?: string | null; resolved_by?: string | null; resolution_notes?: string | null; };
        Update: Partial<Database["public"]["Tables"]["review_queue"]["Insert"]>;
        Relationships: [];
      };
      exclusions: {
        Row: { id: string; training_id: string; role: string | null; department: string | null; reason: string | null; created_at: string; };
        Insert: { id?: string; training_id: string; role?: string | null; department?: string | null; reason?: string | null; };
        Update: Partial<Database["public"]["Tables"]["exclusions"]["Insert"]>;
        Relationships: [];
      };
      new_hire_checklist: {
        Row: { id: string; new_hire_id: string; stage: string | null; item_name: string; item_key: string | null; kind: string | null; required: boolean; completed: boolean; completed_on: string | null; completed_by: string | null; doc_url: string | null; notes: string | null; };
        Insert: { id?: string; new_hire_id: string; stage?: string | null; item_name: string; item_key?: string | null; kind?: string | null; required?: boolean; completed?: boolean; completed_on?: string | null; completed_by?: string | null; doc_url?: string | null; notes?: string | null; };
        Update: Partial<Database["public"]["Tables"]["new_hire_checklist"]["Insert"]>;
        Relationships: [];
      };
      offboarding_checklist: {
        Row: { id: string; separation_id: string; item_name: string; required: boolean; completed: boolean; completed_on: string | null; completed_by: string | null; notes: string | null; };
        Insert: { id?: string; separation_id: string; item_name: string; required?: boolean; completed?: boolean; completed_on?: string | null; completed_by?: string | null; notes?: string | null; };
        Update: Partial<Database["public"]["Tables"]["offboarding_checklist"]["Insert"]>;
        Relationships: [];
      };
      name_aliases: {
        Row: { id: string; employee_id: string; alias_last: string | null; alias_first: string | null; source: string | null; created_at: string; };
        Insert: { id?: string; employee_id: string; alias_last?: string | null; alias_first?: string | null; source?: string | null; };
        Update: Partial<Database["public"]["Tables"]["name_aliases"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: { id: string; actor: string | null; action: string; entity_type: string; entity_id: string | null; before: Json | null; after: Json | null; source: string | null; created_at: string; };
        Insert: { id?: string; actor?: string | null; action: string; entity_type: string; entity_id?: string | null; before?: Json | null; after?: Json | null; source?: string | null; };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      notification_queue: {
        Row: { id: string; org_id: string; recipient_email: string; subject: string; body: string; template: string; payload: Json; scheduled_for: string; sent_at: string | null; status: NotificationStatus; failure_reason: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; org_id: string; recipient_email: string; subject: string; body: string; template?: string; payload?: Json; scheduled_for?: string; status?: NotificationStatus; };
        Update: Partial<Database["public"]["Tables"]["notification_queue"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      vw_compliance_status: {
        Row: {
          employee_id: string | null;
          paylocity_id: string | null;
          legal_first_name: string | null;
          legal_last_name: string | null;
          department: string | null;
          position: string | null;
          training_id: string | null;
          training_code: string | null;
          training_title: string | null;
          cadence_months: number | null;
          completed_on: string | null;
          expires_on: string | null;
          compliance_status: string | null;
          days_until_expiry: number | null;
        };
        Relationships: [];
      };
      vw_turnover_by_fy: {
        Row: {
          evc_fiscal_year: number | null;
          department: string | null;
          separations: number | null;
          voluntary: number | null;
          involuntary: number | null;
          avg_tenure_days: number | null;
          avg_tenure_years: number | null;
        };
        Relationships: [];
      };
      vw_turnover_by_cy: {
        Row: {
          calendar_year: number | null;
          department: string | null;
          separations: number | null;
          voluntary: number | null;
          involuntary: number | null;
          avg_tenure_days: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      bootstrap_organization: { Args: { p_name: string; p_regulator: string; p_fiscal_month: number; p_slug: string; }; Returns: string; };
      recompute_training_expirations: { Args: { p_training_id: string }; Returns: number; };
    };
    Enums: { app_role: AppRole; notification_status: NotificationStatus; };
  };
}
