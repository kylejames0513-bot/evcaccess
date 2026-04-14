// ============================================================
// employee_history reads. Server-only.
// ============================================================
// Wraps the employee_history view, which is the full audit trail
// across every source. INCLUDES terminated employees, unlike
// employee_compliance which filters them out.
//
// Used by:
//   - The employee detail page (/employees/[id]) including for
//     terminated people
//   - The training detail page (/trainings/[id])
//   - Anywhere the UI needs to show "this date came from PHS on Sep 12"
//     provenance
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type { EmployeeHistory } from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

export interface ListHistoryOptions {
  employeeId?: string;
  trainingTypeId?: number;
  source?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export async function listHistory(opts: ListHistoryOptions = {}): Promise<EmployeeHistory[]> {
  let query = db().from("employee_history").select("*");

  if (opts.employeeId) query = query.eq("employee_id", opts.employeeId);
  if (opts.trainingTypeId != null) query = query.eq("training_type_id", opts.trainingTypeId);
  if (opts.source) query = query.eq("source", opts.source);
  if (opts.since) query = query.gte("completion_date", opts.since);
  if (opts.until) query = query.lte("completion_date", opts.until);

  query = query.order("completion_date", { ascending: false });

  if (opts.limit != null) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getHistoryForEmployee(employeeId: string): Promise<EmployeeHistory[]> {
  return listHistory({ employeeId });
}

export async function getHistoryForTraining(trainingTypeId: number): Promise<EmployeeHistory[]> {
  return listHistory({ trainingTypeId });
}
