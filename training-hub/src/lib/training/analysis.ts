import { REQUIRED_LOOKBACK_DAYS, REQUIRED_TRAININGS } from "@/lib/training/constants";
import type {
  ComplianceMetrics,
  ComplianceRow,
  ImportData,
  RequiredTrainingKey,
} from "@/lib/training/types";

function parseMaybeDate(input: string | null): Date | null {
  if (!input) {
    return null;
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateKey(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysUntil(target: Date, now: Date): number {
  const diff = normalizeDateKey(target) - normalizeDateKey(now);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function pickLatestRecord(records: ComplianceRow[]): ComplianceRow | null {
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => {
    const leftDate = parseMaybeDate(left.completedAt)?.getTime() ?? 0;
    const rightDate = parseMaybeDate(right.completedAt)?.getTime() ?? 0;
    return rightDate - leftDate;
  })[0];
}

export function analyzeRecords(
  employees: ImportData["employees"],
  records: ImportData["records"],
): ComplianceMetrics {
  const now = new Date();
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const rows: ComplianceRow[] = [];

  for (const employee of activeEmployees) {
    for (const trainingKey of REQUIRED_TRAININGS) {
      const employeeTrainingRows = records
        .filter((record) => record.employeeId === employee.employeeId && record.trainingKey === trainingKey)
        .map((record) => {
          const expiresAt = parseMaybeDate(record.expiresAt);
          const days = expiresAt ? daysUntil(expiresAt, now) : null;
          const isOverdue = days !== null ? days < 0 : false;
          const isDueSoon = days !== null ? days >= 0 && days <= REQUIRED_LOOKBACK_DAYS : false;
          const isCompliant = days !== null ? days > REQUIRED_LOOKBACK_DAYS : false;

          return {
            rowKey: `${employee.employeeId}:${trainingKey}:${record.completedAt ?? "none"}`,
            employeeId: employee.employeeId,
            employeeName: employee.name,
            division: employee.division,
            trainingKey,
            completedAt: record.completedAt,
            expiresAt: record.expiresAt,
            source: record.source,
            isCompliant,
            isDueSoon,
            isOverdue,
          } satisfies ComplianceRow;
        });

      const latest = pickLatestRecord(employeeTrainingRows);
      if (latest) {
        rows.push(latest);
      } else {
        rows.push({
          rowKey: `${employee.employeeId}:${trainingKey}:missing`,
          employeeId: employee.employeeId,
          employeeName: employee.name,
          division: employee.division,
          trainingKey,
          completedAt: null,
          expiresAt: null,
          source: null,
          isCompliant: false,
          isDueSoon: false,
          isOverdue: true,
        });
      }
    }
  }

  const compliantCount = rows.filter((row) => row.isCompliant).length;
  const complianceRate = rows.length > 0 ? compliantCount / rows.length : 0;

  return {
    rows,
    totalEmployees: activeEmployees.length,
    totalRecords: records.length,
    complianceRate,
  };
}

export function dueStatusLabel(row: ComplianceRow): string {
  if (row.completedAt === null && row.expiresAt === null) {
    return "Missing";
  }
  if (row.isOverdue) {
    return "Overdue";
  }
  if (row.isDueSoon) {
    return "Due Soon";
  }
  return "Compliant";
}

export function countExpiringSoon(rows: ComplianceRow[]): number {
  return rows.filter((row) => row.isDueSoon).length;
}

export function trainingCoverage(rows: ComplianceRow[], trainingKey: RequiredTrainingKey): {
  compliantCount: number;
  total: number;
  rate: number;
} {
  const scoped = rows.filter((row) => row.trainingKey === trainingKey);
  const compliantCount = scoped.filter((row) => row.isCompliant).length;
  return {
    compliantCount,
    total: scoped.length,
    rate: scoped.length > 0 ? compliantCount / scoped.length : 0,
  };
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = parseMaybeDate(value);
  if (!date) {
    return value;
  }
  return date.toLocaleDateString();
}
