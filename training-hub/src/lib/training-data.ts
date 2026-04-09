import { createServerClient } from "./supabase";
import { TRAINING_DEFINITIONS, AUTO_FILL_RULES } from "@/config/trainings";
import { toFirstLast as toFirstLastUtil, namesMatch } from "@/lib/name-utils";
import type { ComplianceStatus } from "@/types/database";

// ============================================================
// Training Data Layer -- Supabase (PostgreSQL)
// ============================================================
// Migrated from Google Sheets reads to direct Supabase queries.
// Uses the employee_compliance view for compliance calculations
// and direct table queries for sessions/enrollments.
// ============================================================

// Excusal codes from Config.gs (kept for backward compat with imported data)
const EXCUSAL_CODES = new Set([
  "NA", "N/A", "N/",
  "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT",
  "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  "ELC", "EI",
  "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  "NURSE", "LPN", "RN", "CNA",
  "BH", "PA", "BA", "QA", "TAC",
  "BOARD",
  "FX1", "FX2", "FX3", "FS",
  "F X 2", "FX 1",
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",
  "TRAINER", "LP", "NS", "LLL",
]);

function isExcusal(value: string): boolean {
  return EXCUSAL_CODES.has(value.trim().toUpperCase());
}

// --------------------------------------------------------
// Employee + compliance data from Supabase
// --------------------------------------------------------

export interface EmployeeTrainingRow {
  name: string;       // "Last, First"
  employeeId: string; // UUID
  position: string;   // department
  hireDate: string;   // Hire Date
  rowIndex: number;   // kept for backward compat (uses numeric hash)
  trainings: Record<string, {
    value: string;        // raw value (date string or excusal code)
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
 * Read compliance data by querying employees, training_records, and excusals
 * separately (each well under 1000 rows) and computing compliance in TypeScript.
 * This avoids the Supabase PostgREST 1000-row default limit on the compliance view.
 */
export async function getTrainingData(): Promise<EmployeeTrainingRow[]> {
  const supabase = createServerClient();

  // Load excluded employees and department rules
  const { getExcludedEmployees, getDeptRules } = await import("@/lib/hub-settings");
  const [excluded, deptRules] = await Promise.all([getExcludedEmployees(), getDeptRules()]);
  const excludedSet = new Set(excluded.map((n) => n.toLowerCase()));
  const deptRequiredMap = new Map<string, Set<string>>();
  for (const rule of deptRules) {
    deptRequiredMap.set(rule.department.toLowerCase(), new Set(rule.required));
  }

  // Fetch training types from Supabase
  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, name, column_key, renewal_years, is_required")
    .eq("is_active", true);

  const ttById = new Map<number, { name: string; column_key: string; renewal_years: number; is_required: boolean }>();
  for (const tt of trainingTypes || []) {
    ttById.set(tt.id, tt);
  }

  // Fetch active employees (well under 1000)
  const { data: empRows, error: empError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, department, hire_date")
    .eq("is_active", true)
    .limit(10000);

  if (empError) throw new Error(`Failed to load employees: ${empError.message}`);
  if (!empRows || empRows.length === 0) return [];

  const empIds = empRows.map((e) => e.id);

  // Fetch latest training records per employee+type (paginate in chunks of employee IDs)
  const recordMap = new Map<string, { completion_date: string; expiration_date: string | null; training_type_id: number }[]>();
  const CHUNK = 200;
  for (let i = 0; i < empIds.length; i += CHUNK) {
    const chunk = empIds.slice(i, i + CHUNK);
    const { data: records } = await supabase
      .from("training_records")
      .select("employee_id, training_type_id, completion_date, expiration_date")
      .in("employee_id", chunk)
      .order("completion_date", { ascending: false });

    for (const r of records || []) {
      const key = `${r.employee_id}|${r.training_type_id}`;
      if (!recordMap.has(key)) {
        if (!recordMap.has(r.employee_id)) recordMap.set(r.employee_id, []);
        recordMap.get(r.employee_id)!.push(r);
        recordMap.set(key, [r]); // mark as seen
      }
    }
  }

  // Fetch excusals (well under 1000)
  const excusalMap = new Map<string, string>();
  const { data: excusals } = await supabase
    .from("excusals")
    .select("employee_id, training_type_id, reason");

  for (const exc of excusals || []) {
    excusalMap.set(`${exc.employee_id}|${exc.training_type_id}`, exc.reason);
  }

  // Compute compliance in TypeScript
  const now = new Date();
  const soonThreshold = new Date();
  soonThreshold.setDate(soonThreshold.getDate() + 60);
  const trackedDefs = TRAINING_DEFINITIONS;
  const employeeMap = new Map<string, EmployeeTrainingRow>();

  for (const emp of empRows) {
    const name = `${emp.last_name}, ${emp.first_name}`;
    if (excludedSet.has(name.toLowerCase())) continue;

    const position = emp.department || "";
    const empRequired = position ? deptRequiredMap.get(position.toLowerCase()) : undefined;
    const employeeDefs = empRequired
      ? empRequired.has("ALL")
        ? trackedDefs
        : trackedDefs.filter((d) => empRequired.has(d.columnKey))
      : trackedDefs;

    const empEntry: EmployeeTrainingRow = {
      name,
      employeeId: emp.id,
      position,
      hireDate: emp.hire_date || "",
      rowIndex: Math.abs(hashCode(emp.id)) % 100000,
      trainings: {},
    };

    // Get this employee's records
    const empRecords = recordMap.get(emp.id) || [];

    for (const def of employeeDefs) {
      // Find the training type ID for this def
      const tt = (trainingTypes || []).find(
        (t) => t.name === def.name || t.column_key === def.columnKey ||
          t.column_key.toLowerCase() === def.columnKey.toLowerCase()
      );
      if (!tt) continue;

      // Check excusal
      const excusalKey = `${emp.id}|${tt.id}`;
      const excusalReason = excusalMap.get(excusalKey);

      // Find latest record for this employee+training
      const record = empRecords.find((r) => r.training_type_id === tt.id);
      const completionDate = record ? new Date(record.completion_date) : null;

      // Prerequisite check
      if (def.prerequisite) {
        const prereqTT = (trainingTypes || []).find(
          (t) => t.column_key === def.prerequisite || t.column_key.toLowerCase() === def.prerequisite?.toLowerCase()
        );
        if (prereqTT) {
          const prereqExcused = excusalMap.has(`${emp.id}|${prereqTT.id}`);
          const prereqRecord = empRecords.find((r) => r.training_type_id === prereqTT.id);
          if (!prereqRecord && !prereqExcused) continue;
        }
      }

      // Compute status
      let status: ComplianceStatus;
      if (excusalReason) {
        status = "excused";
      } else if (!completionDate) {
        status = def.isRequired ? "expired" : "needed";
      } else if (def.renewalYears === 0) {
        status = "current";
      } else {
        const expiry = record?.expiration_date
          ? new Date(record.expiration_date)
          : new Date(completionDate.getTime());
        if (!record?.expiration_date) {
          expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
        }
        if (expiry < now) {
          status = "expired";
        } else if (expiry < soonThreshold) {
          status = "expiring_soon";
        } else {
          status = "current";
        }
      }

      const isExcused = status === "excused";
      const value = isExcused
        ? (excusalReason || "N/A")
        : completionDate
          ? formatDateMDY(completionDate)
          : "";

      // onlyExpired: skip if no date or current
      if (def.onlyExpired && (!completionDate || status === "needed" || status === "current")) {
        if (completionDate && status === "current" && !empEntry.trainings[def.columnKey]) {
          empEntry.trainings[def.columnKey] = { value, date: completionDate, isExcused, status };
        }
        continue;
      }
      // onlyNeeded: skip if already has a date
      if (def.onlyNeeded && completionDate) continue;

      // Don't overwrite if already set
      if (empEntry.trainings[def.columnKey]) continue;

      empEntry.trainings[def.columnKey] = { value, date: completionDate, isExcused, status };
    }

    employeeMap.set(emp.id, empEntry);
  }

  return Array.from(employeeMap.values());
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

function formatDateMDY(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Get compliance issues (expired, expiring soon, needed).
 */
export async function getComplianceIssues(): Promise<ComplianceIssue[]> {
  const data = await getTrainingData();
  const trackedDefs = TRAINING_DEFINITIONS;
  const issues: ComplianceIssue[] = [];

  for (const emp of data) {
    for (const def of trackedDefs) {
      const t = emp.trainings[def.columnKey];
      if (!t) continue;
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

  const priority: Record<string, number> = { expired: 0, expiring_soon: 1, needed: 2 };
  issues.sort((a, b) => {
    const pa = priority[a.status] ?? 3;
    const pb = priority[b.status] ?? 3;
    if (pa !== pb) return pa - pb;
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
 * Dashboard summary stats.
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

// --------------------------------------------------------
// Scheduled sessions from Supabase
// --------------------------------------------------------

export interface ScheduledSession {
  rowIndex: number;
  training: string;
  date: string;
  sortDateMs: number;
  time: string;
  location: string;
  enrolled: string[];
  noShows: string[];
  capacity: number;
  status: "scheduled" | "completed";
}

/**
 * Read scheduled sessions from Supabase training_sessions + enrollments.
 */
export async function getScheduledSessions(): Promise<ScheduledSession[]> {
  const supabase = createServerClient();

  const { data: sessions, error } = await supabase
    .from("training_sessions")
    .select(`
      id, session_date, start_time, location, capacity, status,
      training_types ( name ),
      enrollments ( status, employees ( first_name, last_name ) )
    `)
    .in("status", ["scheduled", "in_progress", "completed"])
    .order("session_date", { ascending: true });

  if (error) throw new Error(`Failed to load sessions: ${error.message}`);
  if (!sessions) return [];

  return sessions.map((s: any, idx: number) => {
    const trainingName = s.training_types?.name || "Unknown";
    const sessionDate = new Date(s.session_date);
    const enrolledNames: string[] = [];
    const noShowNames: string[] = [];

    for (const e of s.enrollments || []) {
      const name = `${e.employees?.first_name} ${e.employees?.last_name}`.trim();
      if (e.status === "no_show") {
        noShowNames.push(name);
      } else if (e.status !== "cancelled") {
        enrolledNames.push(name);
      }
    }

    return {
      rowIndex: idx + 2,
      training: trainingName,
      date: formatDateMDY(sessionDate),
      sortDateMs: sessionDate.getTime(),
      time: s.start_time || "",
      location: s.location || "",
      enrolled: enrolledNames,
      noShows: noShowNames,
      capacity: s.capacity,
      status: s.status === "completed" ? "completed" as const : "scheduled" as const,
    };
  });
}

// --------------------------------------------------------
// Write operations
// --------------------------------------------------------

/**
 * Record a training completion for an employee.
 */
export async function recordCompletion(
  employeeName: string,
  trainingColumnKey: string,
  completionDate: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  // Find the employee
  const employee = await findEmployee(supabase, employeeName);
  if (!employee) return { success: false, message: `Employee "${employeeName}" not found` };

  // Find the training type
  const { data: trainingType } = await supabase
    .from("training_types")
    .select("id, name, column_key")
    .or(`column_key.ilike.${trainingColumnKey},name.ilike.${trainingColumnKey}`)
    .limit(1)
    .single();

  if (!trainingType) return { success: false, message: `Training "${trainingColumnKey}" not found` };

  // Parse the date
  const parsedDate = new Date(completionDate);
  if (isNaN(parsedDate.getTime())) return { success: false, message: "Invalid date" };

  // Insert training record (trigger handles expiration_date and auto-fill)
  const { error } = await supabase
    .from("training_records")
    .insert({
      employee_id: employee.id,
      training_type_id: trainingType.id,
      completion_date: parsedDate.toISOString().split("T")[0],
      source: "manual",
    });

  if (error) return { success: false, message: `Database error: ${error.message}` };

  return {
    success: true,
    message: `Recorded ${completionDate} for ${employeeName} -- ${trainingType.name}`,
  };
}

/**
 * Set or clear an excusal for an employee's training.
 */
export async function setExcusal(
  employeeName: string,
  trainingColumnKey: string,
  excused: boolean,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const employee = await findEmployee(supabase, employeeName);
  if (!employee) return { success: false, message: `Employee "${employeeName}" not found` };

  const { data: trainingType } = await supabase
    .from("training_types")
    .select("id, name")
    .or(`column_key.ilike.${trainingColumnKey},name.ilike.${trainingColumnKey}`)
    .limit(1)
    .single();

  if (!trainingType) return { success: false, message: `Training "${trainingColumnKey}" not found` };

  if (excused) {
    const { error } = await supabase
      .from("excusals")
      .upsert({
        employee_id: employee.id,
        training_type_id: trainingType.id,
        reason: reason || "N/A",
      }, { onConflict: "employee_id,training_type_id" });

    if (error) return { success: false, message: `Database error: ${error.message}` };
  } else {
    const { error } = await supabase
      .from("excusals")
      .delete()
      .eq("employee_id", employee.id)
      .eq("training_type_id", trainingType.id);

    if (error) return { success: false, message: `Database error: ${error.message}` };
  }

  const action = excused ? "Excused" : "Cleared excusal for";
  return { success: true, message: `${action} ${employeeName} -- ${trainingType.name}` };
}

/**
 * Get list of active employee names.
 */
export async function getEmployeeList(): Promise<string[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("employees")
    .select("first_name, last_name")
    .eq("is_active", true)
    .order("last_name")
    .limit(10000);

  if (error) throw new Error(`Failed to load employees: ${error.message}`);

  return (data || []).map((e) => {
    return e.first_name ? `${e.last_name}, ${e.first_name}` : e.last_name;
  }).filter(Boolean);
}

/**
 * Get employees who need a specific training.
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
  const lookAheadDate = def.lookAheadDays && def.renewalYears > 0
    ? new Date(now.getTime() + def.lookAheadDays * 24 * 60 * 60 * 1000) : null;
  const graceDate = def.postExpGraceDays && def.renewalYears > 0
    ? new Date(now.getTime() - def.postExpGraceDays * 24 * 60 * 60 * 1000) : null;

  const results: Array<{ name: string; status: ComplianceStatus; daysExpired: number; daysUntilExpiry: number; division: string }> = [];
  for (const emp of data) {
    const t = emp.trainings[def.columnKey];
    if (!t) continue;

    if (def.onlyExpired && t.status === "needed") continue;
    if (def.onlyNeeded && (t.status === "expired" || t.status === "expiring_soon") && t.date) continue;

    let includeLookAhead = false;
    if (lookAheadDate && t.status === "current" && t.date && def.renewalYears > 0) {
      const expiry = new Date(t.date);
      expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
      if (expiry <= lookAheadDate) includeLookAhead = true;
    }

    if (def.postExpGraceDays && t.status === "expired" && t.date && def.renewalYears > 0) {
      const expiry = new Date(t.date);
      expiry.setFullYear(expiry.getFullYear() + def.renewalYears);
      if (expiry < (graceDate || now)) continue;
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

  const priority: Record<string, number> = { expired: 0, expiring_soon: 1, needed: 2 };
  results.sort((a, b) => {
    const pa = priority[a.status] ?? 3;
    const pb = priority[b.status] ?? 3;
    if (pa !== pb) return pa - pb;
    if (a.status === "expired") return b.daysExpired - a.daysExpired;
    if (a.status === "expiring_soon") return a.daysUntilExpiry - b.daysUntilExpiry;
    return a.name.localeCompare(b.name);
  });
  return results;
}

const toFirstLast = toFirstLastUtil;

/**
 * Create a new session.
 */
export async function createSession(
  trainingType: string,
  date: string,
  time: string,
  location: string,
  enrollees: string[]
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  // Find training type
  const { data: tt } = await supabase
    .from("training_types")
    .select("id, class_capacity")
    .or(`name.ilike.${trainingType},column_key.ilike.${trainingType}`)
    .limit(1)
    .single();

  if (!tt) return { success: false, message: `Training type "${trainingType}" not found` };

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("training_sessions")
    .insert({
      training_type_id: tt.id,
      session_date: date,
      start_time: time || null,
      location: location || null,
      capacity: tt.class_capacity,
    })
    .select("id")
    .single();

  if (sessionErr || !session) return { success: false, message: `Failed to create session: ${sessionErr?.message}` };

  // Enroll employees
  if (enrollees.length > 0) {
    for (const name of enrollees) {
      const employee = await findEmployee(supabase, name);
      if (employee) {
        await supabase.from("enrollments").insert({
          session_id: session.id,
          employee_id: employee.id,
        });
      }
    }
  }

  return {
    success: true,
    message: `Created ${trainingType} session on ${date} with ${enrollees.length} enrollee(s)`,
  };
}

/**
 * Add enrollees to an existing session.
 */
export async function addEnrollees(
  sessionRowIndex: number,
  newNames: string[]
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  // Find session by looking up all sessions sorted by date
  const session = await findSessionByIndex(supabase, sessionRowIndex);
  if (!session) return { success: false, message: "Session not found" };

  // Check all sessions of same training type to prevent double-enrollment
  const { data: otherEnrollments } = await supabase
    .from("enrollments")
    .select("employee_id, training_sessions!inner(training_type_id, status)")
    .eq("training_sessions.training_type_id", session.training_type_id)
    .in("training_sessions.status", ["scheduled", "in_progress"])
    .neq("status", "cancelled");

  const allEnrolledIds = new Set((otherEnrollments || []).map((e: any) => e.employee_id));

  let added = 0;
  const addedNames: string[] = [];
  for (const name of newNames) {
    const employee = await findEmployee(supabase, name);
    if (!employee || allEnrolledIds.has(employee.id)) continue;

    const { error } = await supabase.from("enrollments").insert({
      session_id: session.id,
      employee_id: employee.id,
    });

    if (!error) {
      added++;
      addedNames.push(toFirstLast(name));
    }
  }

  if (added === 0) {
    return { success: false, message: "All selected employees are already enrolled in a session for this training" };
  }

  return { success: true, message: `Added ${added} enrollee(s): ${addedNames.join(", ")}` };
}

/**
 * Remove an enrollee from an existing session.
 */
export async function removeEnrollee(
  sessionRowIndex: number,
  nameToRemove: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const session = await findSessionByIndex(supabase, sessionRowIndex);
  if (!session) return { success: false, message: "Session not found" };

  const employee = await findEmployee(supabase, nameToRemove);
  if (!employee) return { success: false, message: `"${nameToRemove}" not found` };

  const { error, count } = await supabase
    .from("enrollments")
    .delete()
    .eq("session_id", session.id)
    .eq("employee_id", employee.id);

  if (error || count === 0) {
    return { success: false, message: `"${nameToRemove}" not found in enrollment` };
  }

  return { success: true, message: `Removed ${nameToRemove}` };
}

/**
 * Delete a scheduled session.
 */
export async function deleteSession(
  sessionRowIndex: number
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const session = await findSessionByIndex(supabase, sessionRowIndex);
  if (!session) return { success: false, message: "Session not found" };

  const { error } = await supabase
    .from("training_sessions")
    .update({ status: "cancelled" as const })
    .eq("id", session.id);

  if (error) return { success: false, message: `Failed to delete: ${error.message}` };

  return { success: true, message: `Deleted ${session.training_name} on ${session.session_date}` };
}

/**
 * Archive a session: mark completed and record training completions.
 */
export async function archiveSession(
  sessionRowIndex: number
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const session = await findSessionByIndex(supabase, sessionRowIndex);
  if (!session) return { success: false, message: "Session not found" };

  // Get enrollments with employee details
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, employee_id, status, employees(first_name, last_name)")
    .eq("session_id", session.id);

  // Record completions for attended/enrolled (not no-shows)
  for (const enrollment of enrollments || []) {
    if (enrollment.status === "no_show" || enrollment.status === "cancelled") continue;

    // Insert training record (trigger handles expiration + auto-fill)
    await supabase.from("training_records").insert({
      employee_id: enrollment.employee_id,
      training_type_id: session.training_type_id,
      completion_date: session.session_date,
      session_id: session.id,
      source: "session",
    });

    // Update enrollment status
    await supabase.from("enrollments")
      .update({ status: "attended" as const, completed_at: new Date().toISOString() })
      .eq("id", enrollment.id);
  }

  // Mark session as completed
  await supabase.from("training_sessions")
    .update({ status: "completed" as const })
    .eq("id", session.id);

  return { success: true, message: `Archived ${session.training_name} on ${session.session_date}` };
}

/**
 * Read archived sessions.
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
  const supabase = createServerClient();

  const { data: sessions, error } = await supabase
    .from("training_sessions")
    .select(`
      id, session_date, start_time, location, updated_at,
      training_types ( name ),
      enrollments ( status, employees ( first_name, last_name ) )
    `)
    .eq("status", "completed")
    .order("updated_at", { ascending: false });

  if (error || !sessions) return [];

  return sessions.map((s: any) => {
    const enrolled: string[] = [];
    const noShows: string[] = [];
    for (const e of s.enrollments || []) {
      const name = `${e.employees?.first_name} ${e.employees?.last_name}`.trim();
      if (e.status === "no_show") noShows.push(name);
      else if (e.status !== "cancelled") enrolled.push(name);
    }

    return {
      training: s.training_types?.name || "Unknown",
      date: s.session_date,
      time: s.start_time || "",
      location: s.location || "",
      enrolled,
      noShows,
      archivedOn: s.updated_at ? new Date(s.updated_at).toLocaleDateString() : "",
    };
  });
}

/**
 * Record no-shows for a session.
 */
export async function recordNoShows(
  sessionRowIndex: number,
  noShowNames: string[]
): Promise<{ success: boolean; message: string }> {
  if (noShowNames.length === 0) return { success: false, message: "No names provided" };

  const supabase = createServerClient();
  const session = await findSessionByIndex(supabase, sessionRowIndex);
  if (!session) return { success: false, message: "Session not found" };

  for (const name of noShowNames) {
    const employee = await findEmployee(supabase, name);
    if (!employee) continue;

    await supabase.from("enrollments")
      .update({ status: "no_show" as const })
      .eq("session_id", session.id)
      .eq("employee_id", employee.id);
  }

  // Record no-show flags in hub settings
  const { addNoShow } = await import("@/lib/hub-settings");
  const training = session.training_name;
  const date = session.session_date;
  for (const name of noShowNames) {
    await addNoShow(name, training, date);
  }

  return { success: true, message: `Recorded ${noShowNames.length} no-show(s) for session` };
}

// --------------------------------------------------------
// Helper: find employee by name (fuzzy matching)
// --------------------------------------------------------

async function findEmployee(
  supabase: ReturnType<typeof createServerClient>,
  nameInput: string
): Promise<{ id: string; first_name: string; last_name: string } | null> {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("is_active", true)
    .limit(10000);

  if (!employees) return null;

  for (const emp of employees) {
    const combined = `${emp.last_name}, ${emp.first_name}`;
    const firstLast = `${emp.first_name} ${emp.last_name}`;
    if (namesMatch(combined, nameInput) || namesMatch(firstLast, nameInput)) {
      return emp;
    }
  }

  return null;
}

// --------------------------------------------------------
// Helper: find session by row index (maps to sorted position)
// --------------------------------------------------------

async function findSessionByIndex(
  supabase: ReturnType<typeof createServerClient>,
  rowIndex: number
): Promise<{ id: string; session_date: string; training_type_id: number; training_name: string } | null> {
  const { data: sessions } = await supabase
    .from("training_sessions")
    .select("id, session_date, training_type_id, training_types(name)")
    .in("status", ["scheduled", "in_progress"])
    .order("session_date", { ascending: true });

  if (!sessions) return null;

  // rowIndex is 1-based offset from getScheduledSessions (which returns rowIndex = idx + 2)
  const idx = rowIndex - 2;
  if (idx < 0 || idx >= sessions.length) return null;

  const s = sessions[idx] as any;
  return {
    id: s.id,
    session_date: s.session_date,
    training_type_id: s.training_type_id,
    training_name: s.training_types?.name || "Unknown",
  };
}
