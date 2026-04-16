export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "admin" | "coordinator" | "viewer";
export type EmployeeStatus = "active" | "on_leave" | "terminated";
export type CompletionSource =
  | "signin"
  | "import_paylocity"
  | "import_phs"
  | "import_evc_training"
  | "manual"
  | "class_roster";
export type ClassStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";
export type EnrollmentPriority =
  | "expired"
  | "never_completed"
  | "expiring_soon"
  | "refresher";
export type PassFail = "pass" | "fail" | "no_show";
export type ImportSource =
  | "paylocity"
  | "phs"
  | "manual_csv"
  | "evc_training_xlsx"
  | "evc_merged_employees_xlsx";
export type ImportRunStatus = "running" | "success" | "partial" | "failed";
export type NotificationStatus = "pending" | "sent" | "failed";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          regulator: string;
          fiscal_year_start_month: number;
          logo_storage_path: string | null;
          primary_color: string | null;
          paylocity_field_map: Json;
          phs_field_map: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          regulator?: string;
          fiscal_year_start_month?: number;
          logo_storage_path?: string | null;
          primary_color?: string | null;
          paylocity_field_map?: Json;
          phs_field_map?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string | null;
          full_name: string;
          role: AppRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          org_id?: string | null;
          full_name?: string;
          role?: AppRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          org_id: string;
          paylocity_id: string;
          first_name: string;
          last_name: string;
          preferred_name: string | null;
          email: string | null;
          position: string;
          location: string;
          hire_date: string;
          termination_date: string | null;
          status: EmployeeStatus;
          supervisor_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          paylocity_id: string;
          first_name: string;
          last_name: string;
          preferred_name?: string | null;
          email?: string | null;
          position?: string;
          location?: string;
          hire_date: string;
          termination_date?: string | null;
          status?: EmployeeStatus;
          supervisor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      training_types: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          category: string;
          expiration_months: number | null;
          is_required: boolean;
          description: string;
          regulatory_source: string;
          archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          category?: string;
          expiration_months?: number | null;
          is_required?: boolean;
          description?: string;
          regulatory_source?: string;
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_types"]["Insert"]>;
        Relationships: [];
      };
      training_requirements: {
        Row: {
          id: string;
          org_id: string;
          training_type_id: string;
          position: string | null;
          due_within_days_of_hire: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          training_type_id: string;
          position?: string | null;
          due_within_days_of_hire?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_requirements"]["Insert"]>;
        Relationships: [];
      };
      completions: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string;
          training_type_id: string;
          completed_on: string;
          expires_on: string | null;
          source: CompletionSource;
          source_ref: string | null;
          notes: string;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id: string;
          training_type_id: string;
          completed_on: string;
          expires_on?: string | null;
          source: CompletionSource;
          source_ref?: string | null;
          notes?: string;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["completions"]["Insert"]>;
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          org_id: string;
          training_type_id: string;
          scheduled_date: string;
          start_time: string | null;
          end_time: string | null;
          location: string;
          instructor: string;
          capacity: number;
          notes: string;
          status: ClassStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          training_type_id: string;
          scheduled_date: string;
          start_time?: string | null;
          end_time?: string | null;
          location?: string;
          instructor?: string;
          capacity?: number;
          notes?: string;
          status?: ClassStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Insert"]>;
        Relationships: [];
      };
      class_enrollments: {
        Row: {
          id: string;
          class_id: string;
          employee_id: string;
          priority: EnrollmentPriority;
          enrolled_at: string;
          attended: boolean | null;
          pass_fail: PassFail | null;
          left_early: boolean;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          employee_id: string;
          priority?: EnrollmentPriority;
          enrolled_at?: string;
          attended?: boolean | null;
          pass_fail?: PassFail | null;
          left_early?: boolean;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["class_enrollments"]["Insert"]>;
        Relationships: [];
      };
      signin_sessions: {
        Row: {
          id: string;
          org_id: string;
          class_id: string | null;
          employee_id: string | null;
          raw_name: string;
          raw_training: string;
          arrival_time: string;
          device_info: string;
          resolved: boolean;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          class_id?: string | null;
          employee_id?: string | null;
          raw_name: string;
          raw_training?: string;
          arrival_time?: string;
          device_info?: string;
          resolved?: boolean;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["signin_sessions"]["Insert"]>;
        Relationships: [];
      };
      import_runs: {
        Row: {
          id: string;
          org_id: string;
          source: ImportSource;
          filename: string;
          started_at: string;
          finished_at: string | null;
          status: ImportRunStatus;
          rows_processed: number;
          rows_inserted: number;
          rows_updated: number;
          rows_unresolved: number;
          triggered_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          source: ImportSource;
          filename?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: ImportRunStatus;
          rows_processed?: number;
          rows_inserted?: number;
          rows_updated?: number;
          rows_unresolved?: number;
          triggered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_runs"]["Insert"]>;
        Relationships: [];
      };
      unresolved_people: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      unknown_trainings: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      name_aliases: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      exemptions: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_data: Json | null;
          after_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      notification_queue: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      recurring_class_templates: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bootstrap_organization: {
        Args: {
          p_name: string;
          p_regulator: string;
          p_fiscal_month: number;
          p_slug: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
  };
}
