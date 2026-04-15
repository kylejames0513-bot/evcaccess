// ============================================================
// EVC Training Hub: app-level type aliases over the generated schema.
// ============================================================
// Source of truth: src/types/database.generated.ts (regenerated from
// the live Supabase project via the MCP generate_typescript_types
// tool whenever a migration lands).
//
// This file exists so app code can keep importing friendly names like
// `Employee`, `TrainingType`, `TrainingRecord` instead of the
// 5-line generic `Tables<'employees'>` boilerplate. Add new aliases
// here as needed; do NOT redeclare row shapes by hand.
// ============================================================

import type { Database, Tables, TablesInsert, TablesUpdate } from "./database.generated";

export type { Database } from "./database.generated";
export type { Json } from "./database.generated";

// Enums
export type UserRole = Database["public"]["Enums"]["user_role"];
export type ComplianceStatus = Database["public"]["Enums"]["compliance_status"];
export type SessionStatus = Database["public"]["Enums"]["session_status"];
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];
export type ScheduleWeekday = Database["public"]["Enums"]["schedule_weekday"];

// Table row aliases
export type Employee = Tables<"employees">;
export type EmployeeInsert = TablesInsert<"employees">;
export type EmployeeUpdate = TablesUpdate<"employees">;

export type TrainingType = Tables<"training_types">;
export type TrainingTypeInsert = TablesInsert<"training_types">;
export type TrainingTypeUpdate = TablesUpdate<"training_types">;

export type TrainingAlias = Tables<"training_aliases">;
export type TrainingAliasInsert = TablesInsert<"training_aliases">;

export type TrainingRecord = Tables<"training_records">;
export type TrainingRecordInsert = TablesInsert<"training_records">;
export type TrainingRecordUpdate = TablesUpdate<"training_records">;

export type Excusal = Tables<"excusals">;
export type ExcusalInsert = TablesInsert<"excusals">;

export type RequiredTraining = Tables<"required_trainings">;
export type RequiredTrainingInsert = TablesInsert<"required_trainings">;
export type RequiredTrainingUpdate = TablesUpdate<"required_trainings">;

export type ImportRow = Tables<"imports">;
export type ImportInsert = TablesInsert<"imports">;
export type ImportUpdate = TablesUpdate<"imports">;

export type UnresolvedPerson = Tables<"unresolved_people">;
export type UnresolvedPersonInsert = TablesInsert<"unresolved_people">;
export type UnresolvedPersonUpdate = TablesUpdate<"unresolved_people">;

export type UnknownTraining = Tables<"unknown_trainings">;
export type UnknownTrainingInsert = TablesInsert<"unknown_trainings">;
export type UnknownTrainingUpdate = TablesUpdate<"unknown_trainings">;

export type TrainingSession = Tables<"training_sessions">;
export type Enrollment = Tables<"enrollments">;
export type HubSetting = Tables<"hub_settings">;

// View row aliases
export type EmployeeCompliance = Tables<"employee_compliance">;
export type EmployeeHistory = Tables<"employee_history">;
export type MasterCompletion = Tables<"master_completions">;

export type NewHireTrackerRow = Tables<"new_hire_tracker_rows">;
export type NewHireTrackerRowInsert = TablesInsert<"new_hire_tracker_rows">;
export type NewHireTrackerRowUpdate = TablesUpdate<"new_hire_tracker_rows">;

export type SeparationTrackerRow = Tables<"separation_tracker_rows">;
export type SeparationTrackerRowInsert = TablesInsert<"separation_tracker_rows">;
export type SeparationTrackerRowUpdate = TablesUpdate<"separation_tracker_rows">;

// Source enum (string union, not a Postgres enum) used by training_records,
// training_aliases, excusals, imports, unresolved_people, unknown_trainings.
export type ImportSource = "paylocity" | "phs" | "access" | "signin" | "manual" | "cutover";
