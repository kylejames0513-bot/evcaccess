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

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
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
  total_rows: number;
  status_counts: ComplianceStatusCounts;
  tier_counts: ComplianceTierCounts;
  employees_with_any_issue: number;
}

/**
 * Build the dashboard summary in a small number of round trips.
 * Each count uses head:true so PostgREST returns just the count, no rows.
 */
export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const client = db();

  const [
    total,
    current,
    expiringSoon,
    expired,
    needed,
    excused,
    due30,
    due60,
    due90,
    issueEmployees,
  ] = await Promise.all([
    client.from("employee_compliance").select("*", { count: "exact", head: true }),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("status", "current"),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("status", "expiring_soon"),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("status", "expired"),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("status", "needed"),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("status", "excused"),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("due_in_30", true),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("due_in_60", true),
    client.from("employee_compliance").select("*", { count: "exact", head: true }).eq("due_in_90", true),
    client
      .from("employee_compliance")
      .select("employee_id", { count: "exact", head: false })
      .in("status", ["needed", "expired", "expiring_soon"]),
  ]);

  const errs = [total, current, expiringSoon, expired, needed, excused, due30, due60, due90, issueEmployees]
    .map((r) => r.error)
    .filter(Boolean);
  if (errs.length > 0) throw errs[0];

  // count distinct employees with any issue. The .in() above returns rows,
  // we collapse them to a Set client-side to dedupe.
  const distinctIssueEmployees = new Set(
    (issueEmployees.data ?? []).map((r) => r.employee_id).filter((v): v is string => v != null)
  ).size;

  // Overdue tier needs days_overdue > 0; the view doesn't have a boolean
  // overdue column, so we count via status='expired'.
  return {
    total_rows: total.count ?? 0,
    status_counts: {
      current: current.count ?? 0,
      expiring_soon: expiringSoon.count ?? 0,
      expired: expired.count ?? 0,
      needed: needed.count ?? 0,
      excused: excused.count ?? 0,
    },
    tier_counts: {
      due_30: due30.count ?? 0,
      due_60: due60.count ?? 0,
      due_90: due90.count ?? 0,
      overdue: expired.count ?? 0,
    },
    employees_with_any_issue: distinctIssueEmployees,
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
