// ============================================================
// Compliance dashboard reads. Server-only.
// ============================================================
// Wraps the employee_compliance view, which is the canonical source
// for "what does each active employee need and what's their status."
// The view does the required_trainings join and the 30 day window
// calculation; this module just exposes filtered reads and aggregates
// for the dashboard.
//
// Terminated employees are NOT in this view by design. Use db/history
// for the audit trail of terminated people.
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type { EmployeeCompliance, ComplianceStatus } from "@/types/database";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

function db(): DbClient {
  return createServerClient();
}

// ────────────────────────────────────────────────────────────
// Shared column_key fix: Initial Med Training vs Med Recert
// ────────────────────────────────────────────────────────────
// Training types that share a column_key (e.g. Initial Med Training
// and Med Recert both use MED_TRAIN) need special handling:
//   1. A completion under Initial Med (id=5) should satisfy a
//      Med Recert (id=4) requirement
//   2. If no completion at all → show "Initial Med Training" (needed)
//   3. If completion exists → show "Med Recert" with renewal cycle
//
// The compliance view only checks exact training_type_id matches,
// so we fix this in post-processing.
// ────────────────────────────────────────────────────────────

interface ColumnKeyGroup {
  columnKey: string;
  types: { id: number; name: string; renewalYears: number }[];
}

let _columnKeyGroups: ColumnKeyGroup[] | null = null;

async function getSharedColumnKeyGroups(): Promise<ColumnKeyGroup[]> {
  if (_columnKeyGroups) return _columnKeyGroups;
  const { data, error } = await db()
    .from("training_types")
    .select("id, name, column_key, renewal_years")
    .eq("is_active", true);
  if (error) throw error;

  // Find column_keys shared by multiple active training types
  const byKey = new Map<string, { id: number; name: string; renewalYears: number }[]>();
  for (const tt of data ?? []) {
    const key = tt.column_key;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ id: tt.id, name: tt.name, renewalYears: tt.renewal_years });
  }

  _columnKeyGroups = [];
  for (const [columnKey, types] of byKey) {
    if (types.length > 1) _columnKeyGroups.push({ columnKey, types });
  }
  return _columnKeyGroups;
}

/**
 * Post-process compliance rows for training types that share a column_key.
 * For "needed" rows, checks if the employee has a completion under a sibling
 * type. If so, recomputes status using the required type's renewal_years.
 * If not, relabels to the initial (renewal_years=0) type name.
 */
export async function fixSharedColumnKeyCompliance(
  rows: EmployeeCompliance[]
): Promise<EmployeeCompliance[]> {
  const groups = await getSharedColumnKeyGroups();
  if (groups.length === 0) return rows;

  // Build a set of training_type_ids that have siblings
  const siblingMap = new Map<number, ColumnKeyGroup>();
  for (const g of groups) {
    for (const t of g.types) siblingMap.set(t.id, g);
  }

  // Helper: if `row` is the renewal_years=0 ("initial") side of a paired
  // group with a recert sibling, return the recert sibling's renewal years
  // and the column key. Otherwise null.
  function getInitialHalfRecert(row: EmployeeCompliance): { renewalYears: number; columnKey: string } | null {
    if (row.training_type_id == null) return null;
    const g = siblingMap.get(row.training_type_id);
    if (!g) return null;
    const me = g.types.find((t) => t.id === row.training_type_id);
    if (!me || me.renewalYears !== 0) return null;
    const recert = g.types.find((t) => t.renewalYears > 0);
    if (!recert) return null;
    return { renewalYears: recert.renewalYears, columnKey: g.columnKey };
  }

  // Find rows that might need fixing:
  //   - status=needed shared-key rows (existing behavior: backfill from siblings)
  //   - initial-half rows that already have a completion (so we can check if
  //     the paired recert window — including its post-expiration grace — has
  //     elapsed and the employee should retake the initial class)
  const needsFix = rows.filter((r) => {
    if (r.status === "needed" && r.training_type_id != null && siblingMap.has(r.training_type_id)) return true;
    if (getInitialHalfRecert(r)) return true;
    return false;
  });
  if (needsFix.length === 0) return rows;

  // Batch-fetch completions for these employees across sibling types
  const employeeIds = [...new Set(needsFix.map((r) => r.employee_id).filter((id): id is string => id != null))];
  const siblingTypeIds = [...new Set(
    needsFix.flatMap((r) => {
      const g = r.training_type_id != null ? siblingMap.get(r.training_type_id) : undefined;
      return g ? g.types.map((t) => t.id) : [];
    })
  )];

  const { data: records, error } = await db()
    .from("training_records")
    .select("employee_id, training_type_id, completion_date, expiration_date")
    .in("employee_id", employeeIds)
    .in("training_type_id", siblingTypeIds)
    .order("completion_date", { ascending: false });
  if (error) throw error;

  // Defense-in-depth: also pull sibling excusals so that an excusal on
  // "Initial Med Training" satisfies a "Med Recert" requirement (and
  // vice versa) even if the compliance view migration that fixes the
  // excusal join hasn't been applied yet.
  const { data: excRecords, error: excErr } = await db()
    .from("excusals")
    .select("employee_id, training_type_id, reason")
    .in("employee_id", employeeIds)
    .in("training_type_id", siblingTypeIds);
  if (excErr) throw excErr;

  // Index: employee_id|column_key → latest completion across sibling types
  const latestByEmpKey = new Map<string, { completion_date: string; expiration_date: string | null }>();
  for (const rec of records ?? []) {
    const group = siblingMap.get(rec.training_type_id);
    if (!group) continue;
    const key = `${rec.employee_id}|${group.columnKey}`;
    if (!latestByEmpKey.has(key)) {
      latestByEmpKey.set(key, {
        completion_date: rec.completion_date,
        expiration_date: rec.expiration_date,
      });
    }
  }

  // Index: employee_id|column_key → excusal reason (any sibling excusal)
  const excusedByEmpKey = new Map<string, string | null>();
  for (const exc of excRecords ?? []) {
    const group = siblingMap.get(exc.training_type_id);
    if (!group) continue;
    const key = `${exc.employee_id}|${group.columnKey}`;
    if (!excusedByEmpKey.has(key)) {
      excusedByEmpKey.set(key, exc.reason ?? null);
    }
  }

  // Returns true if `completionDate` is so old that the recert window plus
  // its post-expiration grace has fully elapsed — meaning the employee should
  // be treated as needing the initial class again, not just a recert.
  function pastRecertGrace(completionDate: string, columnKey: string, recertRenewalYears: number, todayStr: string): boolean {
    const recertDef = TRAINING_DEFINITIONS.find(
      (d) => d.columnKey === columnKey && (d.renewalYears ?? 0) > 0
    );
    const graceDays = recertDef?.postExpGraceDays ?? 0;
    const expDate = new Date(completionDate);
    expDate.setFullYear(expDate.getFullYear() + recertRenewalYears);
    expDate.setDate(expDate.getDate() + graceDays);
    return expDate.toISOString().slice(0, 10) < todayStr;
  }

  // Now fix the rows
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((row) => {
    const initialHalf = getInitialHalfRecert(row);

    // ──────────────────────────────────────────────────────────
    // Initial-half row that already has its own completion (status came
    // from the view as current / expiring_soon / expired). If the paired
    // recert window plus its grace has elapsed, flip back to "needed" so
    // the employee shows up needing the initial class again.
    // ──────────────────────────────────────────────────────────
    if (initialHalf && row.status !== "needed" && row.training_type_id != null) {
      const group = siblingMap.get(row.training_type_id)!;
      const key = `${row.employee_id}|${group.columnKey}`;
      const sibLatest = latestByEmpKey.get(key);
      // Use whichever completion date is most recent — the row's own or any
      // sibling completion (e.g. a Med Recert record under the recert type).
      const candidates = [row.completion_date, sibLatest?.completion_date].filter(
        (d): d is string => typeof d === "string" && d.length > 0
      );
      if (candidates.length > 0) {
        const latestDate = candidates.sort()[candidates.length - 1];
        if (pastRecertGrace(latestDate, initialHalf.columnKey, initialHalf.renewalYears, today)) {
          return { ...row, status: "needed" as ComplianceStatus };
        }
      }
      return row;
    }

    if (row.status !== "needed" || row.training_type_id == null || !siblingMap.has(row.training_type_id)) return row;

    const group = siblingMap.get(row.training_type_id)!;
    const key = `${row.employee_id}|${group.columnKey}`;

    // First, check if any sibling training_type has an excusal for this
    // employee. If so, the requirement is satisfied — flip status to
    // "excused" so HR doesn't see a phantom "needed" row.
    if (excusedByEmpKey.has(key)) {
      return {
        ...row,
        status: "excused" as ComplianceStatus,
        excusal_reason: excusedByEmpKey.get(key) ?? row.excusal_reason ?? null,
      };
    }

    const latest = latestByEmpKey.get(key);

    if (!latest) {
      // No completion at all → relabel to the initial type name
      const initialType = group.types.find((t) => t.renewalYears === 0);
      if (initialType && initialType.id !== row.training_type_id) {
        return { ...row, training_name: initialType.name };
      }
      return row;
    }

    // Has a completion under a sibling type → recompute status
    const reqType = group.types.find((t) => t.id === row.training_type_id);
    const renewalYears = reqType?.renewalYears ?? 0;

    let newExpiration: string | null = null;
    let newStatus: ComplianceStatus = "current";

    if (renewalYears > 0) {
      const compDate = new Date(latest.completion_date);
      compDate.setFullYear(compDate.getFullYear() + renewalYears);
      newExpiration = compDate.toISOString().slice(0, 10);

      if (newExpiration < today) {
        newStatus = "expired";
      } else {
        // expiring_soon = within 90 days, matches compliance view v3
        // (migration 20260414000200_compliance_view_expiring_90_days).
        const ninetyDays = new Date();
        ninetyDays.setDate(ninetyDays.getDate() + 90);
        if (newExpiration <= ninetyDays.toISOString().slice(0, 10)) {
          newStatus = "expiring_soon";
        } else {
          newStatus = "current";
        }
      }
    } else {
      // Initial-half row that was "needed" in the view (no own completion)
      // but a sibling recert completion exists. Backfill the completion as
      // before, but if the recert window + grace has elapsed, leave status
      // as "needed" so the employee retakes the initial class.
      const recert = group.types.find((t) => t.renewalYears > 0);
      if (recert && pastRecertGrace(latest.completion_date, group.columnKey, recert.renewalYears, today)) {
        newStatus = "needed" as ComplianceStatus;
      }
    }

    return {
      ...row,
      completion_date: latest.completion_date,
      expiration_date: newExpiration,
      status: newStatus,
      training_name: reqType?.name ?? row.training_name,
    };
  });
}

export interface ComplianceFilters {
  department?: string;
  position?: string;
  status?: ComplianceStatus;
  trainingTypeId?: number;
  employeeId?: string;
}

export async function listCompliance(
  filters: ComplianceFilters = {}
): Promise<EmployeeCompliance[]> {
  let query = db().from("employee_compliance").select("*");

  if (filters.department) {
    // Match either column case-insensitively. The compliance view
    // exposes both `department` (sub-unit) and `division` (umbrella),
    // and the rest of the app filters on the umbrella name even
    // though the param is historically called "department". Strip
    // commas so the PostgREST OR parser doesn't break on multi-word
    // division names like "Behavioral Health".
    const safe = filters.department.replace(/[,]/g, "");
    query = query.or(`division.ilike.${safe},department.ilike.${safe}`);
  }
  if (filters.position) query = query.ilike("position", filters.position);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.trainingTypeId != null) query = query.eq("training_type_id", filters.trainingTypeId);
  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);

  query = query.order("last_name", { nullsFirst: false }).order("first_name", { nullsFirst: false });

  // Supabase default limit is 1000 rows. Paginate to get all results.
  const allRows: EmployeeCompliance[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
}

// ────────────────────────────────────────────────────────────
// Aggregates for the dashboard cards
// ────────────────────────────────────────────────────────────

export interface ComplianceStatusCounts {
  current: number;
  expiring_soon: number;
  expired: number;
  needed: number;
  excused: number;
}

export interface ComplianceTierCounts {
  due_30: number;
  due_60: number;
  due_90: number;
  overdue: number;
}

export interface ComplianceSummary {
  total_active_employees: number;
  status_counts: ComplianceStatusCounts;
  tier_counts: ComplianceTierCounts;
}

/**
 * Build the dashboard summary at the EMPLOYEE level. Each employee's
 * overall status is their worst training status:
 *   expired > expiring_soon > needed > current
 * An employee with one expired and one current training counts as
 * "expired", not split across both buckets.
 */
export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const client = db();

  // Pull all compliance rows (one per employee+training). The view
  // already filters to active employees only. Paginate to avoid the
  // default 1000-row Supabase limit.
  const rows: { employee_id: string | null; status: string | null; due_in_30: boolean | null; due_in_60: boolean | null; due_in_90: boolean | null; days_overdue: number | null }[] = [];
  const PAGE = 1000;
  let off = 0;
  while (true) {
    const { data, error } = await client
      .from("employee_compliance")
      .select("employee_id, status, due_in_30, due_in_60, due_in_90, days_overdue")
      .range(off, off + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    off += PAGE;
  }

  // Group by employee, pick worst status per employee.
  const byEmployee = new Map<string, {
    worst: string;
    hasDue30: boolean;
    hasDue60: boolean;
    hasDue90: boolean;
    hasOverdue: boolean;
  }>();

  const statusRank: Record<string, number> = {
    expired: 0,
    expiring_soon: 1,
    needed: 2,
    excused: 3,
    current: 4,
  };

  for (const row of rows ?? []) {
    const eid = row.employee_id;
    if (!eid) continue;
    const existing = byEmployee.get(eid);
    const status = row.status ?? "current";
    const rank = statusRank[status] ?? 4;

    if (!existing) {
      byEmployee.set(eid, {
        worst: status,
        hasDue30: row.due_in_30 === true,
        hasDue60: row.due_in_60 === true,
        hasDue90: row.due_in_90 === true,
        hasOverdue: (row.days_overdue ?? 0) > 0,
      });
    } else {
      if (rank < (statusRank[existing.worst] ?? 4)) {
        existing.worst = status;
      }
      if (row.due_in_30) existing.hasDue30 = true;
      if (row.due_in_60) existing.hasDue60 = true;
      if (row.due_in_90) existing.hasDue90 = true;
      if ((row.days_overdue ?? 0) > 0) existing.hasOverdue = true;
    }
  }

  const counts: ComplianceStatusCounts = { current: 0, expiring_soon: 0, expired: 0, needed: 0, excused: 0 };
  const tiers: ComplianceTierCounts = { due_30: 0, due_60: 0, due_90: 0, overdue: 0 };

  for (const emp of byEmployee.values()) {
    if (emp.worst === "current") counts.current += 1;
    else if (emp.worst === "expiring_soon") counts.expiring_soon += 1;
    else if (emp.worst === "expired") counts.expired += 1;
    else if (emp.worst === "needed") counts.needed += 1;
    else if (emp.worst === "excused") counts.excused += 1;

    if (emp.hasDue30) tiers.due_30 += 1;
    if (emp.hasDue60) tiers.due_60 += 1;
    if (emp.hasDue90) tiers.due_90 += 1;
    if (emp.hasOverdue) tiers.overdue += 1;
  }

  return {
    total_active_employees: byEmployee.size,
    status_counts: counts,
    tier_counts: tiers,
  };
}

/** Column order for CSV export (HR-facing); keep in sync with `complianceRowToCsv`. */
export const COMPLIANCE_CSV_COLUMNS = [
  "paylocity_id",
  "last_name",
  "first_name",
  "department",
  "position",
  "job_title",
  "training_name",
  "status",
  "completion_date",
  "expiration_date",
  "days_overdue",
  "completion_source",
  "excusal_reason",
] as const;

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * CSV-friendly flatten of a compliance row. Used by the dashboard CSV
 * export. Order matches the columns Kyle's HR team expects.
 */
export function complianceRowToCsv(row: EmployeeCompliance): Record<string, string> {
  return {
    paylocity_id: row.paylocity_id ?? "",
    last_name: row.last_name ?? "",
    first_name: row.first_name ?? "",
    department: row.department ?? "",
    position: row.position ?? "",
    job_title: row.job_title ?? "",
    training_name: row.training_name ?? "",
    status: row.status ?? "",
    completion_date: row.completion_date ?? "",
    expiration_date: row.expiration_date ?? "",
    days_overdue: row.days_overdue != null ? String(row.days_overdue) : "",
    completion_source: row.completion_source ?? "",
    excusal_reason: row.excusal_reason ?? "",
  };
}

/** One CSV data line (no header). */
export function complianceRowToCsvLine(row: EmployeeCompliance): string {
  const o = complianceRowToCsv(row);
  return COMPLIANCE_CSV_COLUMNS.map((k) => escapeCsvCell(o[k])).join(",");
}

/** Full CSV document including header row. */
export function complianceRowsToCsvText(rows: EmployeeCompliance[]): string {
  const header = COMPLIANCE_CSV_COLUMNS.join(",");
  const lines = rows.map((r) => complianceRowToCsvLine(r));
  return [header, ...lines].join("\n");
}
