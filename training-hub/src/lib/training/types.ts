export type EmployeeStatus = "active" | "inactive";

export type RequiredTrainingKey = "cpi" | "med" | "cpr" | "abuse" | "hipaa";

export type TrainingFilter = "all" | "due-soon" | "overdue" | RequiredTrainingKey;

export interface Employee {
  employeeId: string;
  name: string;
  division: string | null;
  location: string | null;
  status: EmployeeStatus;
}

export interface TrainingRecord {
  employeeId: string;
  trainingKey: RequiredTrainingKey;
  completedAt: string | null;
  expiresAt: string | null;
  source: string | null;
}

export interface ImportData {
  employees: Employee[];
  records: TrainingRecord[];
}

export interface ImportSummary {
  employeeCount: number;
  recordCount: number;
  warningCount: number;
  warnings: string[];
}

export interface ImportPayload {
  employeesCsv: string;
  recordsCsv: string;
}

export interface ImportResponse {
  summary: ImportSummary;
  data: ImportData;
}

export interface HubSyncState {
  lastRunId: string | null;
  lastSource: string | null;
  lastPushedAt: string | null;
  pushCount: number;
  processedRunIds: string[];
}

export interface HubState {
  data: ImportData | null;
  summary: ImportSummary | null;
  sync: HubSyncState;
}

export interface HubPushPayload {
  runId: string;
  source?: string;
  employees: Record<string, unknown>[];
  records: Record<string, unknown>[];
}

export interface ComplianceRow {
  rowKey: string;
  employeeId: string;
  employeeName: string;
  division: string | null;
  trainingKey: RequiredTrainingKey;
  completedAt: string | null;
  expiresAt: string | null;
  source: string | null;
  isCompliant: boolean;
  isDueSoon: boolean;
  isOverdue: boolean;
}

export interface ComplianceMetrics {
  rows: ComplianceRow[];
  totalEmployees: number;
  totalRecords: number;
  complianceRate: number;
}

export type FrontendView = "dashboard" | "roster" | "compliance" | "sync";
