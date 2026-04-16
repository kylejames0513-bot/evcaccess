import type { CompletionSource, ImportSource } from "@/lib/database.types";

export type ImportPreviewRow = {
  key: string;
  employeePaylocityId?: string;
  employeeName?: string;
  employeeFirstName?: string;
  employeeLastName?: string;
  hireDate?: string;
  employeeStatus?: "active" | "on_leave" | "terminated";
  location?: string;
  trainingName?: string;
  completedOn?: string;
  action:
    | "insert_completion"
    | "noop_duplicate"
    | "unresolved_person"
    | "unknown_training"
    | "upsert_employee"
    | "invalid_employee_row";
  detail?: string;
};

export type ImportPreview = {
  source: ImportSource;
  filename: string;
  rows: ImportPreviewRow[];
  counts: {
    wouldInsert: number;
    wouldUpdate: number;
    noop: number;
    unresolvedPeople: number;
    unknownTrainings: number;
    /** Merged / EVC employee sheet preview only */
    wouldUpsertEmployees: number;
    invalidEmployeeRows: number;
  };
};

export type NormalizedCompletionKey = {
  employeePaylocityId: string;
  trainingName: string;
  completedOn: string;
  source: CompletionSource;
};
