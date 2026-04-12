// @ts-nocheck -- Legacy file slated for deletion in a follow-up cleanup
// once the few remaining /api routes that import from it are migrated
// to src/lib/db. The shape mismatches against the new generated types
// are intentional in this transitional state. Do not write new code
// here; use src/lib/db instead.
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

  // Fetch latest training record per (employee, training_type).
  //
  // Two-pass build:
  //   1. latestByKey  :  "empId|ttId" -> newest record seen
  //   2. recordMap    :  empId        -> Record[]  (used by the compliance loop below)
  //
  // We chunk employee IDs (CHUNK) so the PostgREST `IN (...)` clause stays
  // reasonable, and we paginate inside each chunk (PAGE_SIZE) via range()
  // because the PostgREST default caps a single response at 1000 rows. The
  // previous implementation overloaded one Map with both composite-key dedup
  // entries AND employee-id entries, which was fragile and silently dropped
  // records as the data set grew beyond a few hundred employees.
  type TrainingRecordRow = {
    employee_id: string;
    training_type_id: number;
    completion_date: string;
    expiration_date: string | null;
  };
  const latestByKey = new Map<string, TrainingRecordRow>();
  const CHUNK = 200;
  const PAGE_SIZE = 1000;
  for (let i = 0; i < empIds.length; i += CHUNK) {
    const chunk = empIds.slice(i, i + CHUNK);
    let offset = 0;
    for (;;) {
      const { data: records, error: recErr } = await supabase
        .from("training_records")
        .select("employee_id, training_type_id, completion_date, expiration_date")
        .in("employee_id", chunk)
        .order("completion_date", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (recErr) throw new Error(`Failed to load training_records: ${recErr.message}`);
      if (!records || records.length === 0) break;
      for (const r of records as TrainingRecordRow[]) {
        const key = `${r.employee_id}|${r.training_type_id}`;
        if (!latestByKey.has(key)) latestByKey.set(key, r);
      }
      if (records.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  const recordMap = new Map<string, TrainingRecordRow[]>();
  for (const r of latestByKey.values()) {
    const list = recordMap.get(r.employee_id) ?? [];
    list.push(r);
    recordMap.set(r.employee_id, list);
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
// removed: getDashboardStats — unused since /api/dashboard migrated to
// lib/db/compliance.ts and the employee_compliance view.

// --------------------------------------------------------
// Scheduled sessions from Supabase
// --------------------------------------------------------

export interface ScheduledSession {
  id: string;           // session UUID
  training: string;
  date: string;
  sortDateMs: number;
  time: string;
  endTime: string;
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
      id, session_date, start_time, end_time, location, capacity, status,
      training_types ( name ),
      enrollments ( status, employees ( first_name, last_name ) )
    `)
    .in("status", ["scheduled", "in_progress", "completed"])
    .order("session_date", { ascending: true })
    .limit(5000);

  if (error) throw new Error(`Failed to load sessions: ${error.message}`);
  if (!sessions) return [];

  return sessions.map((s: any) => {
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
      id: s.id,
      training: trainingName,
      date: formatDateMDY(sessionDate),
      sortDateMs: sessionDate.getTime(),
      time: s.start_time || "",
      endTime: s.end_time || "",
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
// removed: getEmployeeList, getEmployeesNeedingTraining — unused since
// the /new-hires and /needs-training routes migrated to lib/db/ and the
// compliance view.

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
  sessionId: string,
  newNames: string[]
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const session = await fetchSessionById(supabase, sessionId);
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
  sessionId: string,
  nameToRemove: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const employee = await findEmployee(supabase, nameToRemove);
  if (!employee) return { success: false, message: `"${nameToRemove}" not found` };

  const { error, count } = await supabase
    .from("enrollments")
    .delete()
    .eq("session_id", sessionId)
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
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const session = await fetchSessionById(supabase, sessionId);
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
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerClient();

  const session = await fetchSessionById(supabase, sessionId);
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

// removed: getArchivedSessions, recordNoShows — unused. The archived
// sessions UI was dropped in favor of filtering training_sessions by
// status='completed' directly; no-show recording happens inside the
// attendance flow.

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
// Helper: find session by UUID
// --------------------------------------------------------

async function fetchSessionById(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string
): Promise<{ id: string; session_date: string; training_type_id: string; training_name: string } | null> {
  const { data: s } = await supabase
    .from("training_sessions")
    .select("id, session_date, training_type_id, training_types(name)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!s) return null;

  return {
    id: (s as any).id,
    session_date: (s as any).session_date,
    training_type_id: (s as any).training_type_id,
    training_name: (s as any).training_types?.name || "Unknown",
  };
}
