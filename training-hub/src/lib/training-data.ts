import { readRange, readSheetAsObjects, appendRows, findRow, updateCell, writeRange, clearCell } from "./google-sheets";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { toFirstLast as toFirstLastUtil, namesMatch } from "@/lib/name-utils";
import { getExcludedEmployees, getCapacity } from "@/lib/hub-settings";
import { cached, invalidateAll } from "@/lib/cache";
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
  // Standard not-applicable
  "NA", "N/A", "N/",
  // Leadership / executive roles
  "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT",
  // Management
  "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  // Location/program excusals
  "ELC", "EI",
  // Department excusals
  "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  // Nursing credentials
  "NURSE", "LPN", "RN", "CNA",
  // Role codes
  "BH", "PA", "BA", "QA", "TAC",
  // Board of Directors
  "BOARD",
  // Facility/failure codes (tracked separately by data integrity)
  "FX1", "FX2", "FX3", "FS",
  "F X 2", "FX 1",
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",
  // Other
  "TRAINER", "LP", "NS", "LLL",
]);

function isExcusal(value: string): boolean {
  return EXCUSAL_CODES.has(value.trim().toUpperCase());
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse dates in various formats:
 *   "4/2/2026", "04/02/2026", "2026-04-02"
 *   "April 6", "April 6 – April 9", "April 27 - 30"
 * Returns the first/start date found.
 */
function parseFuzzyDate(value: string): Date | null {
  if (!value) return null;
  const s = value.trim();

  // Try standard date parse first (handles "4/2/2026", "2026-04-02", etc.)
  const direct = new Date(s);
  if (!isNaN(direct.getTime()) && direct.getFullYear() > 2000) return direct;

  // Try "Month Day" patterns: "April 6", "April 6 – April 9", "April 27 - 30"
  const monthMatch = s.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (monthMatch) {
    const monthNum = MONTH_NAMES[monthMatch[1].toLowerCase()];
    if (monthNum !== undefined) {
      const day = parseInt(monthMatch[2]);
      const year = new Date().getFullYear();
      return new Date(year, monthNum, day);
    }
  }

  return null;
}

/**
 * Normalize any date string to MM/DD/YYYY format.
 * Multi-day ranges like "April 6 – April 9" become "4/6 – 4/9/2026".
 */
function normalizeDateDisplay(value: string): string {
  const s = value.trim();

  // Already in numeric format? Keep it.
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  }

  // Range: "April 6 – April 9" or "April 27 - 30"
  const rangeMatch = s.match(/([A-Za-z]+)\s+(\d{1,2})\s*[–\-]\s*(?:([A-Za-z]+)\s+)?(\d{1,2})/);
  if (rangeMatch) {
    const startMonth = MONTH_NAMES[rangeMatch[1].toLowerCase()];
    const startDay = parseInt(rangeMatch[2]);
    const endMonthName = rangeMatch[3];
    const endDay = parseInt(rangeMatch[4]);
    const endMonth = endMonthName ? MONTH_NAMES[endMonthName.toLowerCase()] : startMonth;

    if (startMonth !== undefined && endMonth !== undefined) {
      const year = new Date().getFullYear();
      return `${startMonth + 1}/${startDay} – ${endMonth + 1}/${endDay}/${year}`;
    }
  }

  // Single: "April 6"
  const singleMatch = s.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (singleMatch) {
    const monthNum = MONTH_NAMES[singleMatch[1].toLowerCase()];
    if (monthNum !== undefined) {
      const day = parseInt(singleMatch[2]);
      const year = new Date().getFullYear();
      return `${monthNum + 1}/${day}/${year}`;
    }
  }

  // Can't parse — return as-is
  return s;
}

function parseDate(value: string): Date | null {
  if (!value || isExcusal(value)) return null;
  const s = value.trim();

  // Try MM/DD/YYYY or M/D/YYYY or MM/DD/YY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = parseInt(slashMatch[3]);
    if (year < 100) year += 2000; // "24" -> 2024
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Try YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Try "Month Day, Year" or "Month Day Year"
  const textMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (textMatch) {
    const monthNum = MONTH_NAMES[textMatch[1].toLowerCase()];
    if (monthNum !== undefined) {
      return new Date(parseInt(textMatch[3]), monthNum, parseInt(textMatch[2]));
    }
  }

  // Fallback to native parsing
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ────────────────────────────────────────────────────────────
// Employee + compliance data from the Training sheet
// ────────────────────────────────────────────────────────────

export interface EmployeeTrainingRow {
  name: string;       // "Last, First" from column A+B
  position: string;   // Column D — job title
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
  division: string;
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

  // Load excluded employees
  const excluded = await getExcludedEmployees();
  const excludedSet = new Set(excluded.map((n) => n.toLowerCase()));

  // All training definitions — department rules control per-division requirements
  const { getDeptRules } = await import("@/lib/hub-settings");
  const trackedDefs = TRAINING_DEFINITIONS;

  // Load department training rules
  const deptRules = await getDeptRules();
  const deptRequiredMap = new Map<string, Set<string>>(); // dept → required training keys
  for (const rule of deptRules) {
    deptRequiredMap.set(rule.department.toLowerCase(), new Set(rule.required));
  }

  const employees: EmployeeTrainingRow[] = [];

  // Resolve key columns by header name (not hardcoded index)
  const hdr = (label: string) =>
    headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
  const lNameCol = hdr("L NAME");
  const fNameCol = hdr("F NAME");
  const activeCol = hdr("ACTIVE");
  const divisionCol = hdr("Division Description");

  if (lNameCol < 0 || fNameCol < 0) return []; // can't proceed without name columns

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const lastName = (row[lNameCol] || "").trim();
    const firstName = (row[fNameCol] || "").trim();
    const position = divisionCol >= 0 ? (row[divisionCol] || "").trim() : "";
    if (!lastName) continue;

    // Combine to "Last, First"
    const name = firstName ? `${lastName}, ${firstName}` : lastName;

    // Only include active employees
    const activeFlag = activeCol >= 0
      ? (row[activeCol] || "").toString().trim().toUpperCase()
      : "Y"; // default to active if no Active column
    if (activeFlag !== "Y") continue;

    // Skip excluded employees
    if (excludedSet.has(name.toLowerCase())) continue;

    // Determine which trainings this employee is monitored for (required)
    // Only trainings in their division's "required" list show on compliance
    // No rule = all tracked trainings are required
    const empRequired = position ? deptRequiredMap.get(position.toLowerCase()) : undefined;
    const employeeDefs = empRequired
      ? empRequired.has("ALL")
        ? trackedDefs
        : trackedDefs.filter((d) => empRequired.has(d.columnKey))
      : trackedDefs; // no rule = all tracked trainings

    const trainings: EmployeeTrainingRow["trainings"] = {};

    for (const def of employeeDefs) {
      const colIndex = headers.findIndex(
        (h) => h.trim().toUpperCase() === def.columnKey.toUpperCase()
      );
      if (colIndex === -1) continue;

      // Prerequisite check: skip if prerequisite column has no date
      // (e.g., Post Med requires MED_TRAIN — don't show if no MED_TRAIN date)
      if (def.prerequisite) {
        const prereqCol = headers.findIndex(
          (h) => h.trim().toUpperCase() === def.prerequisite!.toUpperCase()
        );
        if (prereqCol >= 0) {
          const prereqVal = (row[prereqCol] || "").trim();
          const prereqDate = parseDate(prereqVal);
          if (!prereqDate && !isExcusal(prereqVal)) continue; // no prereq = skip this training
        }
      }

      const value = (row[colIndex] || "").trim();
      const isExcused = isExcusal(value);
      const date = parseDate(value);

      let status: ComplianceStatus;
      if (isExcused) {
        status = "excused";
      } else if (!date) {
        status = def.isRequired ? "expired" : "needed";
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

      // onlyExpired: skip if employee has no date or is current (they need Initial, not Recert)
      // But still write "current" status so the training doesn't disappear
      if (def.onlyExpired && (!date || status === "needed" || status === "current")) {
        if (date && status === "current" && !trainings[def.columnKey]) {
          trainings[def.columnKey] = { value, date, isExcused, status };
        }
        continue;
      }
      // onlyNeeded: skip if employee already has a date (they need Recert, not Initial)
      if (def.onlyNeeded && date) continue;

      // Don't overwrite if this columnKey was already set by a more specific def
      if (trainings[def.columnKey]) continue;

      trainings[def.columnKey] = { value, date, isExcused, status };
    }

    employees.push({ name, position, rowIndex: i + 1, trainings });
  }

  return employees;
}

/**
 * Get compliance issues (expired, expiring soon, needed) across all employees.
 */
export async function getComplianceIssues(): Promise<ComplianceIssue[]> {
  const data = await getTrainingData();
  // Use all training definitions — department rules already filtered per employee
  const trackedDefs = TRAINING_DEFINITIONS;
  const issues: ComplianceIssue[] = [];

  for (const emp of data) {
    for (const def of trackedDefs) {
      const t = emp.trainings[def.columnKey];
      if (!t) continue;

      // Respect onlyExpired/onlyNeeded so Med Recert and Initial Med Training
      // don't double-report the same column
      if (def.onlyExpired && t.status === "needed") continue;
      if (def.onlyNeeded && (t.status === "expired" || t.status === "expiring_soon") && t.date) continue;

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
          division: emp.position,
        });
      }
    }
  }

  // Sort: by status priority first, then by expiration date (soonest first)
  const priority: Record<string, number> = { expired: 0, expiring_soon: 1, needed: 2 };
  issues.sort((a, b) => {
    const pa = priority[a.status] ?? 3;
    const pb = priority[b.status] ?? 3;
    if (pa !== pb) return pa - pb;
    // Within same status, sort by date (earliest first, nulls last)
    if (a.expirationDate && b.expirationDate) return a.expirationDate.localeCompare(b.expirationDate);
    if (a.expirationDate) return -1;
    if (b.expirationDate) return 1;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.employee.localeCompare(b.employee);
  });

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
    upcomingSessions: scheduled.filter((s) => s.status === "scheduled").length,
  };
}

// ────────────────────────────────────────────────────────────
// Scheduled sessions from the Scheduled sheet
// ────────────────────────────────────────────────────────────

export interface ScheduledSession {
  rowIndex: number;
  training: string;
  date: string;
  sortDateMs: number;   // millisecond timestamp for reliable sorting
  time: string;
  location: string;
  enrolled: string[];   // names of enrolled people
  noShows: string[];    // names of people who didn't show
  capacity: number;
  status: "scheduled" | "completed";
}

/**
 * Read the Scheduled sheet to get upcoming training sessions.
 * Columns match Rosters.gs rewriteScheduledSheet_:
 *   A: Type (training name)
 *   B: Dates
 *   C: Time
 *   D: Location
 *   E: Enrollment (comma-separated names)
 */
export async function getScheduledSessions(): Promise<ScheduledSession[]> {
  const rows = await readRange(SCHEDULED_SHEET);
  if (rows.length < 2) return [];

  // Load all capacity overrides once
  const { getCapacityOverrides } = await import("@/lib/hub-settings");
  const overrides = await getCapacityOverrides();

  // Build a lookup: any name/alias/columnKey → override capacity
  function resolveCapacity(training: string, defaultCap: number): number {
    // Direct match
    if (overrides[training] !== undefined) return overrides[training];

    // Find via training definitions
    const def = TRAINING_DEFINITIONS.find(
      (d) => d.name.toLowerCase() === training.toLowerCase() ||
        d.columnKey.toLowerCase() === training.toLowerCase() ||
        d.aliases?.some((a) => a.toLowerCase() === training.toLowerCase())
    );
    if (def) {
      if (overrides[def.name] !== undefined) return overrides[def.name];
      if (overrides[def.columnKey] !== undefined) return overrides[def.columnKey];
    }
    return defaultCap;
  }

  const sessions: ScheduledSession[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let lastType = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const colA = (row[0] || "").trim();
    const colB = (row[1] || "").trim();
    const colC = (row[2] || "").trim();
    const colD = (row[3] || "").trim();
    const colE = (row[4] || "").trim();

    // Skip header rows
    if (colA === "Type" || colA === "a. Upcoming Training") continue;

    // Type-only row (no date) = section header
    if (colA && !colB && !colC && !colD && !colE) { lastType = colA; continue; }

    // Blank row
    if (!colA && !colB && !colC && !colD && !colE) continue;

    const training = colA || lastType;
    if (colA) lastType = colA;
    if (!colB) continue; // no date = skip

    // Normalize the date display to MM/DD/YYYY format
    const normalizedDate = normalizeDateDisplay(colB);
    const sortDate = parseFuzzyDate(colB);

    const colF = (row[5] || "").trim();

    // Enrollment is comma-separated names in column E
    const enrolled = colE
      ? colE.split(",").map((n) => n.trim()).filter((n) => n && n !== "TBD")
      : [];

    // No-shows are comma-separated names in column F
    const noShows = colF
      ? colF.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    // Find capacity from training config
    const def = TRAINING_DEFINITIONS.find(
      (d) => d.name.toLowerCase() === training.toLowerCase() ||
        d.aliases?.some((a) => a.toLowerCase() === training.toLowerCase())
    );

    sessions.push({
      rowIndex: i + 1,
      training,
      date: normalizedDate,
      sortDateMs: sortDate ? sortDate.getTime() : 0,
      time: colC,
      location: colD,
      enrolled,
      noShows,
      capacity: resolveCapacity(training, def?.classCapacity || 15),
      status: sortDate && sortDate < now ? "completed" : "scheduled",
    });
  }

  // Sort by date — earliest first
  sessions.sort((a, b) => a.sortDateMs - b.sortDateMs);
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

  // Find name columns by header
  const lCol = headers.findIndex((h) => h.trim().toUpperCase() === "L NAME");
  const fCol = headers.findIndex((h) => h.trim().toUpperCase() === "F NAME");

  // Find the employee row (format-agnostic: handles "First Last" and "Last, First")
  const empRow = rows.findIndex((row, i) => {
    if (i === 0) return false;
    if (lCol >= 0 && fCol >= 0) {
      const last = (row[lCol] || "").trim();
      const first = (row[fCol] || "").trim();
      const combined = first ? `${last}, ${first}` : last;
      return namesMatch(combined, employeeName);
    }
    // Fallback: match first column
    return namesMatch((row[0] || "").trim(), employeeName);
  });
  if (empRow === -1) {
    return { success: false, message: `Employee "${employeeName}" not found` };
  }

  await updateCell(TRAINING_SHEET, empRow + 1, colIndex, completionDate);
  invalidateAll();
  return { success: true, message: `Recorded ${completionDate} for ${employeeName} — ${trainingColumnKey}` };
}

/**
 * Set or clear an excusal (N/A) for an employee's training.
 * Finds their row on the Training sheet and writes "N/A" or clears the cell.
 */
export async function setExcusal(
  employeeName: string,
  trainingColumnKey: string,
  excused: boolean,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const rows = await readRange(TRAINING_SHEET);
  if (rows.length < 2) return { success: false, message: "Training sheet is empty" };

  const headers = rows[0];
  const colIndex = headers.findIndex(
    (h) => h.trim().toUpperCase() === trainingColumnKey.toUpperCase()
  );
  if (colIndex === -1) {
    return { success: false, message: `Column "${trainingColumnKey}" not found` };
  }

  // Find name columns by header
  const lCol = headers.findIndex((h) => h.trim().toUpperCase() === "L NAME");
  const fCol = headers.findIndex((h) => h.trim().toUpperCase() === "F NAME");

  // Find employee by "Last, First" matching
  const nameLower = employeeName.trim().toLowerCase();
  let empRow = -1;
  for (let i = 1; i < rows.length; i++) {
    const last = (rows[i][lCol >= 0 ? lCol : 0] || "").trim();
    const first = (rows[i][fCol >= 0 ? fCol : 1] || "").trim();
    const combined = first ? `${last}, ${first}`.toLowerCase() : last.toLowerCase();
    if (combined === nameLower) {
      empRow = i;
      break;
    }
  }

  if (empRow === -1) {
    return { success: false, message: `Employee "${employeeName}" not found` };
  }

  if (excused) {
    await updateCell(TRAINING_SHEET, empRow + 1, colIndex, reason || "N/A");
  } else {
    await clearCell(TRAINING_SHEET, empRow + 1, colIndex);
  }
  invalidateAll();

  const action = excused ? "Excused" : "Cleared excusal for";
  return { success: true, message: `${action} ${employeeName} — ${trainingColumnKey}` };
}

/**
 * Get the list of active employees (names) from the Training sheet.
 */
export async function getEmployeeList(): Promise<string[]> {
  const rows = await readRange(`${TRAINING_SHEET}!A:C`);
  return rows
    .slice(1)
    .filter((r) => (r[2] || "").toString().trim().toUpperCase() === "Y")
    .map((r) => {
      const last = (r[0] || "").trim();
      const first = (r[1] || "").trim();
      return first ? `${last}, ${first}` : last;
    })
    .filter(Boolean);
}

/**
 * Get employees who need a specific training (expired, expiring, or never completed).
 * Returns names sorted by priority: expired first, then expiring, then needed.
 */
export async function getEmployeesNeedingTraining(
  trainingName: string
): Promise<Array<{ name: string; status: ComplianceStatus; daysExpired: number; daysUntilExpiry: number; division: string }>> {
  const data = await getTrainingData();
  const def = TRAINING_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === trainingName.toLowerCase() ||
      d.aliases?.some((a) => a.toLowerCase() === trainingName.toLowerCase())
  );
  if (!def) return [];

  const now = new Date();

  // Look-ahead: include people expiring within lookAheadDays
  // Grace period: include people expired within postExpGraceDays (can still recert)
  const lookAheadDate = def.lookAheadDays && def.renewalYears > 0
    ? new Date(now.getTime() + def.lookAheadDays * 24 * 60 * 60 * 1000) : null;
  const graceDate = def.postExpGraceDays && def.renewalYears > 0
    ? new Date(now.getTime() - def.postExpGraceDays * 24 * 60 * 60 * 1000) : null;

  const results: Array<{ name: string; status: ComplianceStatus; daysExpired: number; daysUntilExpiry: number; division: string }> = [];
  for (const emp of data) {
    const t = emp.trainings[def.columnKey];
    if (!t) continue;

    // Respect onlyExpired/onlyNeeded
    if (def.onlyExpired && (t.status === "needed")) continue;
    if (def.onlyNeeded && (t.status === "expired" || t.status === "expiring_soon") && t.date) continue;

    // Look-ahead: include "current" employees expiring within lookAheadDays
    let includeLookAhead = false;
    if (lookAheadDate && t.status === "current" && t.date && def.renewalYears > 0) {
      const expiry = new Date(t.date);
      expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
      if (expiry <= lookAheadDate) includeLookAhead = true;
    }

    // Grace period: for expired people, only include if expired within grace days
    // (expired more than 30 days = lost cert, needs Initial Med again)
    if (def.postExpGraceDays && t.status === "expired" && t.date && def.renewalYears > 0) {
      const expiry = new Date(t.date);
      expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
      if (expiry < (graceDate || now)) continue; // too long expired — skip for recert
    }

    if (t.status === "expired" || t.status === "expiring_soon" || t.status === "needed" || includeLookAhead) {
      let daysExpired = 0;
      let daysUntilExpiry = 0;

      if (t.date && def.renewalYears > 0) {
        const expiry = new Date(t.date);
        expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
        const diffMs = now.getTime() - expiry.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffMs > 0) {
          daysExpired = Math.max(diffDays, 0);
        } else {
          daysUntilExpiry = Math.max(-diffDays, 0);
        }
      } else if (t.status === "needed" || (t.status === "expired" && !t.date)) {
        daysExpired = 9999;
      }

      const effectiveStatus = includeLookAhead && t.status === "current" ? "expiring_soon" as ComplianceStatus : t.status;
      results.push({ name: emp.name, status: effectiveStatus, daysExpired, daysUntilExpiry, division: emp.position });
    }
  }

  // Sort: expired by daysExpired DESC (longest expired first),
  // then expiring_soon by daysUntilExpiry ASC (soonest first),
  // then needed
  const priority: Record<string, number> = { expired: 0, expiring_soon: 1, needed: 2 };
  results.sort((a, b) => {
    const pa = priority[a.status] ?? 3;
    const pb = priority[b.status] ?? 3;
    if (pa !== pb) return pa - pb;
    if (a.status === "expired") return b.daysExpired - a.daysExpired; // longest expired first
    if (a.status === "expiring_soon") return a.daysUntilExpiry - b.daysUntilExpiry; // soonest first
    return a.name.localeCompare(b.name);
  });
  return results;
}

// Use shared toFirstLast from name-utils
const toFirstLast = toFirstLastUtil;

/**
 * Create a new session on the Scheduled sheet.
 * Appends a row: [Type, Date, Time, Location, Enrollment]
 */
export async function createSession(
  trainingType: string,
  date: string,
  time: string,
  location: string,
  enrollees: string[]
): Promise<{ success: boolean; message: string }> {
  const enrollStr = enrollees.length > 0 ? enrollees.map(toFirstLast).join(", ") : "TBD";
  await appendRows(SCHEDULED_SHEET, [[trainingType, date, time, location, enrollStr]]);
  invalidateAll();
  return {
    success: true,
    message: `Created ${trainingType} session on ${date} with ${enrollees.length} enrollee(s)`,
  };
}

/**
 * Add enrollees to an existing session on the Scheduled sheet.
 * Reads current enrollment from column E, appends new names, writes back.
 */
export async function addEnrollees(
  sessionRowIndex: number,
  newNames: string[]
): Promise<{ success: boolean; message: string }> {
  const rows = await readRange(SCHEDULED_SHEET);
  const row = rows[sessionRowIndex - 1];
  if (!row) return { success: false, message: "Session row not found" };

  const sessionTraining = (row[0] || "").trim();
  const currentEnrollment = (row[4] || "").trim();
  const existing = currentEnrollment && currentEnrollment !== "TBD"
    ? currentEnrollment.split(",").map((n) => n.trim()).filter(Boolean)
    : [];

  // Collect ALL names enrolled in any session of the same training type
  const { trainingMatchesAny } = await import("@/lib/training-match");
  const allEnrolledInTraining: string[] = [...existing];
  for (let r = 1; r < rows.length; r++) {
    if (r === sessionRowIndex - 1) continue; // skip current session
    const otherTraining = (rows[r][0] || "").trim();
    const otherEnrollment = (rows[r][4] || "").trim();
    if (!otherTraining || !otherEnrollment) continue;
    if (trainingMatchesAny(otherTraining, sessionTraining)) {
      const otherNames = otherEnrollment.split(",").map((n) => n.trim()).filter((n) => n && n !== "TBD");
      allEnrolledInTraining.push(...otherNames);
    }
  }

  // Convert new names to "First Last" format for the sheet
  const newNamesConverted = newNames.map(toFirstLast);

  // Don't add if already enrolled in THIS session or ANY other session of same training
  const toAdd = newNamesConverted.filter(
    (n) => !allEnrolledInTraining.some((e) => namesMatch(e, n))
  );

  if (toAdd.length === 0) {
    return { success: false, message: "All selected employees are already enrolled in a session for this training" };
  }

  const updated = [...existing, ...toAdd].join(", ");
  await updateCell(SCHEDULED_SHEET, sessionRowIndex, 4, updated);
  invalidateAll();
  return {
    success: true,
    message: `Added ${toAdd.length} enrollee(s): ${toAdd.join(", ")}`,
  };
}

/**
 * Remove an enrollee from an existing session.
 */
export async function removeEnrollee(
  sessionRowIndex: number,
  nameToRemove: string
): Promise<{ success: boolean; message: string }> {
  const rows = await readRange(SCHEDULED_SHEET);
  const row = rows[sessionRowIndex - 1];
  if (!row) return { success: false, message: "Session row not found" };

  const currentEnrollment = (row[4] || "").trim();
  const existing = currentEnrollment
    ? currentEnrollment.split(",").map((n) => n.trim()).filter(Boolean)
    : [];

  const updated = existing.filter(
    (n) => !namesMatch(n, nameToRemove)
  );

  if (updated.length === existing.length) {
    return { success: false, message: `"${nameToRemove}" not found in enrollment` };
  }

  const newStr = updated.length > 0 ? updated.join(", ") : "TBD";
  await updateCell(SCHEDULED_SHEET, sessionRowIndex, 4, newStr);
  invalidateAll();
  return { success: true, message: `Removed ${nameToRemove}` };
}

/**
 * Delete a scheduled session by clearing its row on the Scheduled sheet.
 */
export async function deleteSession(
  sessionRowIndex: number
): Promise<{ success: boolean; message: string }> {
  const rows = await readRange(SCHEDULED_SHEET);
  const row = rows[sessionRowIndex - 1];
  if (!row) return { success: false, message: "Session row not found" };

  const training = (row[0] || "").trim();
  const date = (row[1] || "").trim();

  // Clear all columns in this row (A through F)
  await writeRange(
    `${SCHEDULED_SHEET}!A${sessionRowIndex}:F${sessionRowIndex}`,
    [["", "", "", "", "", ""]]
  );
  invalidateAll();
  return { success: true, message: `Deleted ${training} on ${date}` };
}

const ARCHIVE_SHEET = "Archive";

/**
 * Archive a session: copy to Archive sheet, then clear from Scheduled.
 */
export async function archiveSession(
  sessionRowIndex: number
): Promise<{ success: boolean; message: string }> {
  const rows = await readRange(SCHEDULED_SHEET);
  const row = rows[sessionRowIndex - 1];
  if (!row) return { success: false, message: "Session row not found" };

  const training = (row[0] || "").trim();
  const date = (row[1] || "").trim();
  const time = (row[2] || "").trim();
  const location = (row[3] || "").trim();
  const enrolled = (row[4] || "").trim();
  const noShows = (row[5] || "").trim();
  const archivedDate = new Date().toLocaleDateString();

  // Ensure Archive sheet exists
  const { getSheetNames } = await import("./google-sheets");
  const { getSheets, getSpreadsheetId } = await import("./google-sheets");
  const sheetNames = await getSheetNames();
  if (!sheetNames.includes(ARCHIVE_SHEET)) {
    const sheets = getSheets();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: {
        requests: [{ addSheet: { properties: { title: ARCHIVE_SHEET } } }],
      },
    });
    await writeRange(`'${ARCHIVE_SHEET}'!A1:G1`, [["Training", "Date", "Time", "Location", "Enrolled", "No-Shows", "Archived On"]]);
  }

  // Append to Archive
  await appendRows(ARCHIVE_SHEET, [[training, date, time, location, enrolled, noShows, archivedDate]]);

  // Record completion dates on the Training sheet for enrolled employees (skip no-shows)
  const trainingDef = TRAINING_DEFINITIONS.find(
    (d) =>
      d.name.toLowerCase() === training.toLowerCase() ||
      d.columnKey.toLowerCase() === training.toLowerCase() ||
      d.aliases?.some((a) => a.toLowerCase() === training.toLowerCase())
  );
  if (trainingDef) {
    const enrolledNames = enrolled
      ? enrolled.split(",").map((n) => n.trim()).filter((n) => n && n !== "TBD")
      : [];
    const noShowNames = noShows
      ? noShows.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    const completionDate = normalizeDateDisplay(date);

    for (const enrolledName of enrolledNames) {
      // Skip no-shows
      if (noShowNames.some((ns) => namesMatch(ns, enrolledName))) continue;

      try {
        const result = await recordCompletion(enrolledName, trainingDef.columnKey, completionDate);
        if (!result.success) {
          console.warn(`[archiveSession] Could not record completion for "${enrolledName}": ${result.message}`);
        }
      } catch (err) {
        console.warn(`[archiveSession] Error recording completion for "${enrolledName}":`, err);
      }
    }
  } else {
    console.warn(`[archiveSession] No training definition found for "${training}" — skipping completion writes`);
  }

  // Clear from Scheduled
  await writeRange(
    `${SCHEDULED_SHEET}!A${sessionRowIndex}:F${sessionRowIndex}`,
    [["", "", "", "", "", ""]]
  );

  invalidateAll();
  return { success: true, message: `Archived ${training} on ${date}` };
}

/**
 * Read all sessions from the Archive sheet.
 */
export async function getArchivedSessions(): Promise<
  Array<{
    training: string;
    date: string;
    time: string;
    location: string;
    enrolled: string[];
    noShows: string[];
    archivedOn: string;
  }>
> {
  let rows: string[][];
  try {
    rows = await readRange(ARCHIVE_SHEET);
  } catch {
    // Archive sheet may not exist yet
    return [];
  }
  if (rows.length < 2) return [];

  // Skip header row
  return rows.slice(1).filter((row) => (row[0] || "").trim()).map((row) => ({
    training: (row[0] || "").trim(),
    date: (row[1] || "").trim(),
    time: (row[2] || "").trim(),
    location: (row[3] || "").trim(),
    enrolled: (row[4] || "")
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && n !== "TBD"),
    noShows: (row[5] || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
    archivedOn: (row[6] || "").trim(),
  }));
}

/**
 * Record no-shows for a session. Writes names to column F and removes them from enrollment (column E).
 */
export async function recordNoShows(
  sessionRowIndex: number,
  noShowNames: string[]
): Promise<{ success: boolean; message: string }> {
  if (noShowNames.length === 0) {
    return { success: false, message: "No names provided" };
  }

  const rows = await readRange(SCHEDULED_SHEET);
  const row = rows[sessionRowIndex - 1];
  if (!row) return { success: false, message: "Session row not found" };

  // Remove no-shows from enrollment (column E)
  const currentEnrollment = (row[4] || "").trim();
  const enrolled = currentEnrollment
    ? currentEnrollment.split(",").map((n) => n.trim()).filter(Boolean)
    : [];

  const updatedEnrolled = enrolled.filter(
    (n) => !noShowNames.some((ns) => namesMatch(n, ns))
  );
  const enrollStr = updatedEnrolled.length > 0 ? updatedEnrolled.join(", ") : "TBD";

  // Append to existing no-shows in column F
  const existingNoShows = (row[5] || "").trim();
  const allNoShows = existingNoShows
    ? existingNoShows + ", " + noShowNames.join(", ")
    : noShowNames.join(", ");

  // Write both columns
  await writeRange(
    `${SCHEDULED_SHEET}!E${sessionRowIndex}:F${sessionRowIndex}`,
    [[enrollStr, allNoShows]]
  );

  // Record no-show flags in Hub Settings for tracking
  const { addNoShow } = await import("@/lib/hub-settings");
  const training = (row[0] || "").trim();
  const date = (row[1] || "").trim();
  for (const name of noShowNames) {
    await addNoShow(name, training, date);
  }

  invalidateAll();
  return {
    success: true,
    message: `Recorded ${noShowNames.length} no-show(s) for session`,
  };
}
