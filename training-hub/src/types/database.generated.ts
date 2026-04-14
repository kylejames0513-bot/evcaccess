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
      auto_fill_rules: {
        Row: {
          id: number
          offset_days: number
          source_type_id: number
          target_type_id: number
        }
        Insert: {
          id?: number
          offset_days?: number
          source_type_id: number
          target_type_id: number
        }
        Update: {
          id?: number
          offset_days?: number
          source_type_id?: number
          target_type_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_fill_rules_source_type_id_fkey"
            columns: ["source_type_id"]
            isOneToOne: false
            referencedRelation: "employee_compliance"
            referencedColumns: ["training_type_id"]
          },
          {
            foreignKeyName: "auto_fill_rules_source_type_id_fkey"
            columns: ["source_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_fill_rules_target_type_id_fkey"
            columns: ["target_type_id"]
            isOneToOne: false
            referencedRelation: "employee_compliance"
            referencedColumns: ["training_type_id"]
          },
          {
            foreignKeyName: "auto_fill_rules_target_type_id_fkey"
            columns: ["target_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          aliases: string[]
          auth_id: string | null
          created_at: string
          department: string | null
          division: string | null
          email: string | null
          employee_number: string | null
          excusal_codes: string[] | null
          first_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          job_title: string | null
          last_name: string
          paylocity_id: string | null
          position: string | null
          program: string | null
          reactivated_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          terminated_at: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          auth_id?: string | null
          created_at?: string
          department?: string | null
          division?: string | null
          email?: string | null
          employee_number?: string | null
          excusal_codes?: string[] | null
          first_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          last_name: string
          paylocity_id?: string | null
          position?: string | null
          program?: string | null
          reactivated_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          terminated_at?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          auth_id?: string | null
          created_at?: string
          department?: string | null
          division?: string | null
          email?: string | null
          employee_number?: string | null
          excusal_codes?: string[] | null
          first_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          last_name?: string
          paylocity_id?: string | null
          position?: string | null
          program?: string | null
          reactivated_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          terminated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          checked_in_at: string | null
          completed_at: string | null
          employee_id: string
          enrolled_at: string
          id: string
          notes: string | null
          score: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          checked_in_at?: string | null
          completed_at?: string | null
          employee_id: string
          enrolled_at?: string
          id?: string
          notes?: string | null
          score?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          checked_in_at?: string | null
          completed_at?: string | null
          employee_id?: string
          enrolled_at?: string
          id?: string
          notes?: string | null
          score?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: []
      }
      excusals: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          reason: string
          source: string
          training_type_id: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          reason: string
          source?: string
          training_type_id: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          source?: string
          training_type_id?: number
        }
        Relationships: []
      }
      hub_settings: {
        Row: {
          created_at: string
          id: number
          key: string
          type: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: number
          key: string
          type: string
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: number
          key?: string
          type?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          committed_at: string | null
          error: string | null
          filename: string | null
          finished_at: string | null
          id: string
          preview_payload: Json | null
          rows_added: number | null
          rows_in: number | null
          rows_skipped: number | null
          rows_unknown: number | null
          rows_unresolved: number | null
          rows_updated: number | null
          source: string
          started_at: string
          status: string
          uploaded_by: string | null
        }
        Insert: {
          committed_at?: string | null
          error?: string | null
          filename?: string | null
          finished_at?: string | null
          id?: string
          preview_payload?: Json | null
          rows_added?: number | null
          rows_in?: number | null
          rows_skipped?: number | null
          rows_unknown?: number | null
          rows_unresolved?: number | null
          rows_updated?: number | null
          source: string
          started_at?: string
          status?: string
          uploaded_by?: string | null
        }
        Update: {
          committed_at?: string | null
          error?: string | null
          filename?: string | null
          finished_at?: string | null
          id?: string
          preview_payload?: Json | null
          rows_added?: number | null
          rows_in?: number | null
          rows_skipped?: number | null
          rows_unknown?: number | null
          rows_unresolved?: number | null
          rows_updated?: number | null
          source?: string
          started_at?: string
          status?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      nicknames: {
        Row: {
          alias: string
          id: number
          is_evc: boolean
          name: string
        }
        Insert: {
          alias: string
          id?: number
          is_evc?: boolean
          name: string
        }
        Update: {
          alias?: string
          id?: number
          is_evc?: boolean
          name?: string
        }
        Relationships: []
      }
      required_trainings: {
        Row: {
          created_at: string
          department: string | null
          id: number
          is_required: boolean
          is_universal: boolean
          notes: string | null
          position: string | null
          training_type_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: number
          is_required?: boolean
          is_universal?: boolean
          notes?: string | null
          position?: string | null
          training_type_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: number
          is_required?: boolean
          is_universal?: boolean
          notes?: string | null
          position?: string | null
          training_type_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      training_aliases: {
        Row: {
          alias: string
          id: number
          source: string
          training_type_id: number
        }
        Insert: {
          alias: string
          id?: number
          source?: string
          training_type_id: number
        }
        Update: {
          alias?: string
          id?: number
          source?: string
          training_type_id?: number
        }
        Relationships: []
      }
      training_records: {
        Row: {
          arrival_time: string | null
          completion_date: string
          created_at: string
          employee_id: string
          end_time: string | null
          expiration_date: string | null
          id: string
          left_early: string | null
          notes: string | null
          pass_fail: string | null
          reason: string | null
          reviewed_by: string | null
          session_id: string | null
          session_length: string | null
          source: string
          training_type_id: number
        }
        Insert: {
          arrival_time?: string | null
          completion_date: string
          created_at?: string
          employee_id: string
          end_time?: string | null
          expiration_date?: string | null
          id?: string
          left_early?: string | null
          notes?: string | null
          pass_fail?: string | null
          reason?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          session_length?: string | null
          source?: string
          training_type_id: number
        }
        Update: {
          arrival_time?: string | null
          completion_date?: string
          created_at?: string
          employee_id?: string
          end_time?: string | null
          expiration_date?: string | null
          id?: string
          left_early?: string | null
          notes?: string | null
          pass_fail?: string | null
          reason?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          session_length?: string | null
          source?: string
          training_type_id?: number
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          capacity: number
          created_at: string
          end_time: string | null
          id: string
          instructor: string | null
          location: string | null
          notes: string | null
          session_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["session_status"]
          training_type_id: number
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          end_time?: string | null
          id?: string
          instructor?: string | null
          location?: string | null
          notes?: string | null
          session_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          training_type_id: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          end_time?: string | null
          id?: string
          instructor?: string | null
          location?: string | null
          notes?: string | null
          session_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          training_type_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      training_types: {
        Row: {
          class_capacity: number
          column_key: string
          created_at: string
          id: number
          is_active: boolean
          is_required: boolean
          name: string
          only_expired: boolean
          only_needed: boolean
          prerequisite_id: number | null
          renewal_years: number
        }
        Insert: {
          class_capacity?: number
          column_key: string
          created_at?: string
          id?: number
          is_active?: boolean
          is_required?: boolean
          name: string
          only_expired?: boolean
          only_needed?: boolean
          prerequisite_id?: number | null
          renewal_years?: number
        }
        Update: {
          class_capacity?: number
          column_key?: string
          created_at?: string
          id?: number
          is_active?: boolean
          is_required?: boolean
          name?: string
          only_expired?: boolean
          only_needed?: boolean
          prerequisite_id?: number | null
          renewal_years?: number
        }
        Relationships: []
      }
      unknown_trainings: {
        Row: {
          created_at: string
          id: string
          import_id: string
          occurrence_count: number
          raw_name: string
          raw_payload: Json
          resolved_at: string | null
          resolved_by: string | null
          resolved_to_training_type_id: number | null
          source: string
          suggested_training_type_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_id: string
          occurrence_count?: number
          raw_name: string
          raw_payload: Json
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_to_training_type_id?: number | null
          source: string
          suggested_training_type_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          import_id?: string
          occurrence_count?: number
          raw_name?: string
          raw_payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_to_training_type_id?: number | null
          source?: string
          suggested_training_type_id?: number | null
        }
        Relationships: []
      }
      unresolved_people: {
        Row: {
          created_at: string
          first_name: string | null
          full_name: string | null
          id: string
          import_id: string
          last_name: string | null
          paylocity_id: string | null
          raw_payload: Json
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_to_employee_id: string | null
          source: string
          suggested_employee_id: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          import_id: string
          last_name?: string | null
          paylocity_id?: string | null
          raw_payload: Json
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_to_employee_id?: string | null
          source: string
          suggested_employee_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          import_id?: string
          last_name?: string | null
          paylocity_id?: string | null
          raw_payload?: Json
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_to_employee_id?: string | null
          source?: string
          suggested_employee_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      employee_compliance: {
        Row: {
          completion_date: string | null
          completion_source: string | null
          days_overdue: number | null
          department: string | null
          division: string | null
          due_in_30: boolean | null
          due_in_60: boolean | null
          due_in_90: boolean | null
          employee_id: string | null
          excusal_reason: string | null
          expiration_date: string | null
          first_name: string | null
          is_required: boolean | null
          job_title: string | null
          last_name: string | null
          paylocity_id: string | null
          position: string | null
          program: string | null
          renewal_years: number | null
          status: Database["public"]["Enums"]["compliance_status"] | null
          training_name: string | null
          training_type_id: number | null
        }
        Relationships: []
      }
      employee_history: {
        Row: {
          completion_date: string | null
          department: string | null
          employee_id: string | null
          expiration_date: string | null
          first_name: string | null
          is_active: boolean | null
          job_title: string | null
          last_name: string | null
          notes: string | null
          pass_fail: string | null
          paylocity_id: string | null
          position: string | null
          reactivated_at: string | null
          recorded_at: string | null
          renewal_years: number | null
          reviewed_by: string | null
          source: string | null
          terminated_at: string | null
          training_column_key: string | null
          training_name: string | null
          training_record_id: string | null
          training_type_id: number | null
        }
        Relationships: []
      }
      master_completions: {
        Row: {
          completion_date: string | null
          employee_id: string | null
          expiration_date: string | null
          recorded_at: string | null
          source: string | null
          training_record_id: string | null
          training_type_id: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_employee_alias: {
        Args: { emp_id: string; new_alias: string }
        Returns: undefined
      }
      commit_import: { Args: { import_id: string }; Returns: string }
      reactivate_employee_with_paylocity_id: {
        Args: { new_paylocity_id: string; orphan_id: string }
        Returns: string
      }
      upsert_employees_from_sheet: {
        Args: { emps: Json }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
    }
    Enums: {
      attendance_status:
        | "enrolled"
        | "attended"
        | "passed"
        | "failed"
        | "no_show"
        | "cancelled"
      compliance_status:
        | "current"
        | "expiring_soon"
        | "expired"
        | "needed"
        | "excused"
      schedule_weekday:
        | "Monday"
        | "Tuesday"
        | "Wednesday"
        | "Thursday"
        | "Friday"
        | "Saturday"
        | "Sunday"
      session_status: "scheduled" | "in_progress" | "completed" | "cancelled"
      user_role: "employee" | "supervisor" | "hr_admin"
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
    Enums: {
      attendance_status: [
        "enrolled",
        "attended",
        "passed",
        "failed",
        "no_show",
        "cancelled",
      ],
      compliance_status: [
        "current",
        "expiring_soon",
        "expired",
        "needed",
        "excused",
      ],
      schedule_weekday: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      session_status: ["scheduled", "in_progress", "completed", "cancelled"],
      user_role: ["employee", "supervisor", "hr_admin"],
    },
  },
} as const
