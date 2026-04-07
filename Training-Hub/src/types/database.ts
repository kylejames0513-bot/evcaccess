// ============================================================
// EVC Training Hub — Database Types
// ============================================================
// Auto-maps to Supabase schema. Keep in sync with migrations.
// ============================================================

export type UserRole = "employee" | "supervisor" | "hr_admin";
export type ComplianceStatus = "current" | "expiring_soon" | "expired" | "needed" | "excused";
export type SessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type AttendanceStatus = "enrolled" | "attended" | "passed" | "failed" | "no_show" | "cancelled";

export interface Employee {
  id: string;
  auth_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  role: UserRole;
  job_title: string | null;
  department: string | null;
  program: string | null;
  hire_date: string | null;
  is_active: boolean;
  excusal_codes: string[];
  created_at: string;
  updated_at: string;
}

export interface TrainingType {
  id: number;
  name: string;
  column_key: string;
  renewal_years: number;
  is_required: boolean;
  class_capacity: number;
  prerequisite_id: number | null;
  only_expired: boolean;
  only_needed: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TrainingAlias {
  id: number;
  training_type_id: number;
  alias: string;
}

export interface TrainingSchedule {
  id: number;
  training_type_id: number;
  weekday: string;
  nth_weeks: number[] | null;
  weeks_out: number;
  start_time: string | null;
  duration_minutes: number;
  location: string | null;
}

export interface TrainingSession {
  id: string;
  training_type_id: number;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  instructor: string | null;
  capacity: number;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  training_type?: TrainingType;
  enrollments?: Enrollment[];
  enrolled_count?: number;
}

export interface Enrollment {
  id: string;
  session_id: string;
  employee_id: string;
  status: AttendanceStatus;
  enrolled_at: string;
  checked_in_at: string | null;
  completed_at: string | null;
  score: string | null;
  notes: string | null;
  // Joined fields
  employee?: Employee;
  session?: TrainingSession;
}

export interface TrainingRecord {
  id: string;
  employee_id: string;
  training_type_id: number;
  completion_date: string;
  expiration_date: string | null;
  session_id: string | null;
  source: string;
  notes: string | null;
  created_at: string;
  // Joined fields
  training_type?: TrainingType;
  employee?: Employee;
}

export interface Excusal {
  id: string;
  employee_id: string;
  training_type_id: number;
  reason: string;
  created_at: string;
}

export interface EmployeeCompliance {
  employee_id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  department: string | null;
  program: string | null;
  training_type_id: number;
  training_name: string;
  renewal_years: number;
  is_required: boolean;
  completion_date: string | null;
  expiration_date: string | null;
  excusal_reason: string | null;
  status: ComplianceStatus;
}

export interface Notification {
  id: string;
  employee_id: string | null;
  type: string;
  subject: string;
  body: string | null;
  sent_at: string;
  channel: string;
}

export interface RemovalLog {
  id: string;
  employee_id: string;
  session_id: string;
  removed_by: string | null;
  reason: string | null;
  removed_at: string;
}
