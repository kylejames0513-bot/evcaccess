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

  // Find rows that might need fixing: status=needed for a shared-key type
  const needsFix = rows.filter(
    (r) => r.status === "needed" && r.training_type_id != null && siblingMap.has(r.training_type_id)
  );
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

  // Index: employee_id → latest completion across sibling types (by column_key)
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

  // Now fix the rows
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((row) => {
    if (row.status !== "needed" || row.training_type_id == null || !siblingMap.has(row.training_type_id)) return row;

    const group = siblingMap.get(row.training_type_id)!;
    const key = `${row.employee_id}|${group.columnKey}`;
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
        const thirtyDays = new Date();
        thirtyDays.setDate(thirtyDays.getDate() + 30);
        if (newExpiration <= thirtyDays.toISOString().slice(0, 10)) {
          newStatus = "expiring_soon";
        } else {
          newStatus = "current";
        }
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

  if (filters.department) query = query.ilike("department", filters.department);
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
