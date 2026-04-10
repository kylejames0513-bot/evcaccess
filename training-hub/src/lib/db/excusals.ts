// ============================================================
// excusals data access. Server-only.
// ============================================================
// CRUD for the (employee, training) -> excused mapping. The unique
// constraint on (employee_id, training_type_id) means each pair has at
// most one excusal at a time; setExcusal upserts on that key.
//
// `source` is required: it tracks which workflow created the excusal so
// the merged_sheet cleanup migration in cutover Stage 2 can wipe only the
// noisy auto-generated entries without clobbering legitimate manual
// excusals.
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type { Excusal, ExcusalInsert, ImportSource } from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

export async function listExcusalsForEmployee(employeeId: string): Promise<Excusal[]> {
  const { data, error } = await db()
    .from("excusals")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) throw error;
  return data ?? [];
}

export async function listExcusalsForTraining(trainingTypeId: number): Promise<Excusal[]> {
  const { data, error } = await db()
    .from("excusals")
    .select("*")
    .eq("training_type_id", trainingTypeId);
  if (error) throw error;
  return data ?? [];
}

export async function getExcusal(
  employeeId: string,
  trainingTypeId: number
): Promise<Excusal | null> {
  const { data, error } = await db()
    .from("excusals")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("training_type_id", trainingTypeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Upsert an excusal on (employee_id, training_type_id). If a row already
 * exists for this pair, the reason and source are overwritten with the
 * incoming values. This matches the agreed behavior: excusals are
 * single-source decisions, the latest wins.
 */
export async function setExcusal(input: {
  employee_id: string;
  training_type_id: number;
  reason: string;
  source: ImportSource;
}): Promise<Excusal> {
  const row: ExcusalInsert = {
    employee_id: input.employee_id,
    training_type_id: input.training_type_id,
    reason: input.reason,
    source: input.source,
  };
  const { data, error } = await db()
    .from("excusals")
    .upsert(row, { onConflict: "employee_id,training_type_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function removeExcusal(
  employeeId: string,
  trainingTypeId: number
): Promise<void> {
  const { error } = await db()
    .from("excusals")
    .delete()
    .eq("employee_id", employeeId)
    .eq("training_type_id", trainingTypeId);
  if (error) throw error;
}

/**
 * Bulk-delete every excusal whose source matches the given value.
 * Used by the cutover Stage 2 cleanup to wipe the 11,407 noisy
 * merged_sheet rows. Caller MUST confirm with Kyle before calling
 * this with source='merged_sheet' against the live DB.
 */
export async function deleteExcusalsBySource(source: string): Promise<number> {
  const { error, count } = await db()
    .from("excusals")
    .delete({ count: "exact" })
    .eq("source", source);
  if (error) throw error;
  return count ?? 0;
}
