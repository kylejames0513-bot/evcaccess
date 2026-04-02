import { readRange, readSheetAsObjects, appendRows, findRow, updateCell } from "./google-sheets";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import type { ComplianceStatus } from "@/types/database";

// ============================================================
// Training Data Layer — reads/writes your existing Google Sheet
// ============================================================
// Sheet names match your Config.gs constants:
//   "Training"           — employee names + training dates
//   "Scheduled"          — upcoming classes
//   "Scheduled Overview" — summary of scheduled trainings
//   "Training Rosters"   — compliance rosters
//   "Removal Log"        — audit trail
// ============================================================

const TRAINING_SHEET = "Training";
const SCHEDULED_SHEET = "Scheduled";
const OVERVIEW_SHEET = "Scheduled Overview";

// Excusal codes from Config.gs
const EXCUSAL_CODES = new Set([
  "NA", "N/A", "N/",
  "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT",
  "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  "ELC", "EI", "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  "NURSE", "LPN", "RN", "CNA",
  "BH", "PA", "BA", "QA", "TAC",
  "TRAINER", "LP", "NS", "LLL",
]);

function isExcusal(value: string): boolean {
  return EXCUSAL_CODES.has(value.trim().toUpperCase());
}

function parseDate(value: string): Date | null {
  if (!value || isExcusal(value)) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ────────────────────────────────────────────────────────────
// Employee + compliance data from the Training sheet
// ────────────────────────────────────────────────────────────

export interface EmployeeTrainingRow {
  name: string;       // "Last, First" from column A
  rowIndex: number;   // 1-based row in sheet
  trainings: Record<string, {
    value: string;        // raw cell value
    date: Date | null;    // parsed date or null
    isExcused: boolean;
    status: ComplianceStatus;
  }>;
}

export interface ComplianceIssue {
  employee: string;
  training: string;
  status: ComplianceStatus;
  date: string | null;
  expirationDate: string | null;
}

export interface DashboardStats {
  totalEmployees: number;
  fullyCompliant: number;
  expiringSoon: number;
  expired: number;
  needed: number;
  upcomingSessions: number;
}

/**
 * Read the Training sheet and compute compliance for every employee.
 */
export async function getTrainingData(): Promise<EmployeeTrainingRow[]> {
  const rows = await readRange(TRAINING_SHEET);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const now = new Date();
  const soonThreshold = new Date();
  soonThreshold.setDate(soonThreshold.getDate() + 60);

  const employees: EmployeeTrainingRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[0] || "").trim();
    if (!name) continue;

    const trainings: EmployeeTrainingRow["trainings"] = {};

    for (const def of TRAINING_DEFINITIONS) {
      const colIndex = headers.findIndex(
        (h) => h.trim().toUpperCase() === def.columnKey.toUpperCase()
      );
      if (colIndex === -1) continue;

      const value = (row[colIndex] || "").trim();
      const isExcused = isExcusal(value);
      const date = parseDate(value);

      let status: ComplianceStatus;
      if (isExcused) {
        status = "excused";
      } else if (!date) {
        status = "needed";
      } else if (def.renewalYears === 0) {
        status = "current"; // one-and-done, has a date
      } else {
        const expiry = new Date(date);
        expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
        if (expiry < now) {
          status = "expired";
        } else if (expiry < soonThreshold) {
          status = "expiring_soon";
        } else {
          status = "current";
        }
      }

      trainings[def.columnKey] = { value, date, isExcused, status };
    }

    employees.push({ name, rowIndex: i + 1, trainings });
  }

  return employees;
}

/**
 * Get compliance issues (expired, expiring soon, needed) across all employees.
 */
export async function getComplianceIssues(): Promise<ComplianceIssue[]> {
  const data = await getTrainingData();
  const issues: ComplianceIssue[] = [];

  for (const emp of data) {
    for (const def of TRAINING_DEFINITIONS) {
      const t = emp.trainings[def.columnKey];
      if (!t) continue;
      if (t.status === "expired" || t.status === "expiring_soon" || t.status === "needed") {
        let expirationDate: string | null = null;
        if (t.date && def.renewalYears > 0) {
          const exp = new Date(t.date);
          exp.setFullYear(exp.getFullYear() + def.renewalYears);
          expirationDate = exp.toISOString().split("T")[0];
        }
        issues.push({
          employee: emp.name,
          training: def.name,
          status: t.status,
          date: t.date ? t.date.toISOString().split("T")[0] : null,
          expirationDate,
        });
      }
    }
  }

  // Sort: expired first, then expiring_soon, then needed
  const priority: Record<string, number> = { expired: 0, expiring_soon: 1, needed: 2 };
  issues.sort((a, b) => (priority[a.status] ?? 3) - (priority[b.status] ?? 3));

  return issues;
}

/**
 * Get dashboard summary stats.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const data = await getTrainingData();
  const issues = await getComplianceIssues();
  const scheduled = await getScheduledSessions();

  let fullyCompliant = 0;
  for (const emp of data) {
    const hasIssue = Object.values(emp.trainings).some(
      (t) => t.status === "expired" || t.status === "expiring_soon" || t.status === "needed"
    );
    if (!hasIssue) fullyCompliant++;
  }

  return {
    totalEmployees: data.length,
    fullyCompliant,
    expiringSoon: issues.filter((i) => i.status === "expiring_soon").length,
    expired: issues.filter((i) => i.status === "expired").length,
    needed: issues.filter((i) => i.status === "needed").length,
    upcomingSessions: scheduled.filter((s) => new Date(s.date) >= new Date()).length,
  };
}

// ────────────────────────────────────────────────────────────
// Scheduled sessions from the Scheduled sheet
// ────────────────────────────────────────────────────────────

export interface ScheduledSession {
  rowIndex: number;
  training: string;
  date: string;
  time: string;
  location: string;
  instructor: string;
  enrolled: string[];   // names of enrolled people
  capacity: number;
  status: "scheduled" | "completed";
}

/**
 * Read the Scheduled sheet to get upcoming training sessions.
 * Expected columns: Training Type, Date, Time, Location, Instructor, then enrollee names
 */
export async function getScheduledSessions(): Promise<ScheduledSession[]> {
  const rows = await readRange(SCHEDULED_SHEET);
  if (rows.length < 2) return [];

  const sessions: ScheduledSession[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const training = (row[0] || "").trim();
    const dateStr = (row[1] || "").trim();
    if (!training || !dateStr) continue;

    const date = parseDate(dateStr);
    const enrolled = row.slice(5).filter((v) => v && v.trim() && v.trim() !== "\u2014 open \u2014");

    // Find capacity from training config
    const def = TRAINING_DEFINITIONS.find(
      (d) => d.name.toLowerCase() === training.toLowerCase() ||
        d.aliases?.some((a) => a.toLowerCase() === training.toLowerCase())
    );

    sessions.push({
      rowIndex: i + 1,
      training,
      date: dateStr,
      time: (row[2] || "").trim(),
      location: (row[3] || "").trim(),
      instructor: (row[4] || "").trim(),
      enrolled,
      capacity: def?.classCapacity || 15,
      status: date && date < now ? "completed" : "scheduled",
    });
  }

  return sessions;
}

// ────────────────────────────────────────────────────────────
// Write operations
// ────────────────────────────────────────────────────────────

/**
 * Record a training completion for an employee.
 * Finds their row on the Training sheet and writes the date to the correct column.
 */
export async function recordCompletion(
  employeeName: string,
  trainingColumnKey: string,
  completionDate: string
): Promise<{ success: boolean; message: string }> {
  const rows = await readRange(TRAINING_SHEET);
  if (rows.length < 2) return { success: false, message: "Training sheet is empty" };

  const headers = rows[0];
  const colIndex = headers.findIndex(
    (h) => h.trim().toUpperCase() === trainingColumnKey.toUpperCase()
  );
  if (colIndex === -1) {
    return { success: false, message: `Column "${trainingColumnKey}" not found in Training sheet` };
  }

  // Find the employee row (case-insensitive, trimmed)
  const empRow = rows.findIndex(
    (row, i) => i > 0 && row[0]?.trim().toLowerCase() === employeeName.trim().toLowerCase()
  );
  if (empRow === -1) {
    return { success: false, message: `Employee "${employeeName}" not found` };
  }

  await updateCell(TRAINING_SHEET, empRow + 1, colIndex, completionDate);
  return { success: true, message: `Recorded ${completionDate} for ${employeeName} — ${trainingColumnKey}` };
}

/**
 * Get the list of employees (names) from column A of the Training sheet.
 */
export async function getEmployeeList(): Promise<string[]> {
  const rows = await readRange(`${TRAINING_SHEET}!A:A`);
  return rows
    .slice(1)
    .map((r) => (r[0] || "").trim())
    .filter(Boolean);
}
