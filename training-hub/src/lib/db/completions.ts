// ============================================================
// training_records (completions) data access. Server-only.
// ============================================================
// Reads and writes for the audit log of every (employee, training,
// completion_date, source) tuple. Inserts go through ON CONFLICT DO
// NOTHING via the (employee_id, training_type_id, completion_date)
// unique index so re-running the same import is a no-op.
//
// Reads come in two flavors:
//   - listCompletions: raw audit log filtered however the caller wants
//   - getMasterCompletions: winning row per (employee, training) via
//     the master_completions view (latest date wins, source preference
//     as tiebreaker)
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type {
  TrainingRecord,
  TrainingRecordInsert,
  MasterCompletion,
  ImportSource,
} from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

export interface ListCompletionsOptions {
  employeeId?: string;
  trainingTypeId?: number;
  source?: ImportSource | string;
  since?: string; // ISO date
  until?: string; // ISO date
  limit?: number;
  offset?: number;
}

export async function listCompletions(
  opts: ListCompletionsOptions = {}
): Promise<TrainingRecord[]> {
  let query = db().from("training_records").select("*");

  if (opts.employeeId) query = query.eq("employee_id", opts.employeeId);
  if (opts.trainingTypeId != null) query = query.eq("training_type_id", opts.trainingTypeId);
  if (opts.source) query = query.eq("source", opts.source);
  if (opts.since) query = query.gte("completion_date", opts.since);
  if (opts.until) query = query.lte("completion_date", opts.until);

  query = query.order("completion_date", { ascending: false });

  if (opts.limit != null) {
    query = query.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCompletionById(id: string): Promise<TrainingRecord | null> {
  const { data, error } = await db()
    .from("training_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Read winning completion per (employee, training) for a single employee
 * from the master_completions view. Used by the employee detail page.
 */
export async function getMasterCompletionsForEmployee(
  employeeId: string
): Promise<MasterCompletion[]> {
  const { data, error } = await db()
    .from("master_completions")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Read winning completion per (employee, training) for a single training
 * across all employees. Used by the training detail page.
 */
export async function getMasterCompletionsForTraining(
  trainingTypeId: number
): Promise<MasterCompletion[]> {
  const { data, error } = await db()
    .from("master_completions")
    .select("*")
    .eq("training_type_id", trainingTypeId);
  if (error) throw error;
  return data ?? [];
}

// ────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────

/**
 * Insert a single completion. The
 * training_records_emp_type_date_unique index handles dedupe via
 * ON CONFLICT DO NOTHING. Returns the inserted row, or null if it
 * collided with an existing one.
 */
export async function insertCompletion(
  row: TrainingRecordInsert
): Promise<TrainingRecord | null> {
  const { data, error } = await db()
    .from("training_records")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

/**
 * Bulk insert completions one row at a time so we can dedupe via the
 * 23505 catch path and report a precise added count to the imports row.
 * Returns {added, skipped} so the caller can populate imports.rows_added
 * and imports.rows_skipped.
 *
 * For large imports the inserts run sequentially. PostgREST does not give
 * us a clean per-row "did this collide" answer on a single batch insert,
 * which is why we go one at a time. The cost is acceptable: a Paylocity
 * full export is ~1500 rows, which takes seconds, not minutes.
 */
export interface BulkInsertResult {
  added: number;
  skipped: number;
}

export async function insertCompletionsBulk(
  rows: TrainingRecordInsert[]
): Promise<BulkInsertResult> {
  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    const inserted = await insertCompletion(row);
    if (inserted) {
      added += 1;
    } else {
      skipped += 1;
    }
  }
  return { added, skipped };
}

/**
 * Delete a completion by id. Used by the records review UI to remove
 * accidental rows. Does NOT cascade through auto_fill: any auto-filled
 * mirror rows must be deleted separately.
 */
export async function deleteCompletion(id: string): Promise<void> {
  const { error } = await db().from("training_records").delete().eq("id", id);
  if (error) throw error;
}
