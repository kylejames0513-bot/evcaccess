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
