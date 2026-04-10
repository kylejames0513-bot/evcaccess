// ============================================================
// unresolved_people + unknown_trainings data access. Server-only.
// ============================================================
// Read and resolve helpers for the two review queues. The resolution
// review UI calls these to list open items, accept resolutions, and
// (for unknown_trainings) backfill historical training_records when an
// alias mapping is created retroactively.
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type {
  UnresolvedPerson,
  UnresolvedPersonInsert,
  UnresolvedPersonUpdate,
  UnknownTraining,
  UnknownTrainingInsert,
  UnknownTrainingUpdate,
} from "@/types/database";
import { addTrainingAlias } from "@/lib/db/trainings";

function db(): DbClient {
  return createServerClient();
}

// ────────────────────────────────────────────────────────────
// unresolved_people
// ────────────────────────────────────────────────────────────

export interface ListUnresolvedPeopleOptions {
  openOnly?: boolean;
  importId?: string;
  source?: string;
}

export async function listUnresolvedPeople(
  opts: ListUnresolvedPeopleOptions = {}
): Promise<UnresolvedPerson[]> {
  let query = db().from("unresolved_people").select("*");
  if (opts.openOnly) query = query.is("resolved_at", null);
  if (opts.importId) query = query.eq("import_id", opts.importId);
  if (opts.source) query = query.eq("source", opts.source);
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getUnresolvedPerson(id: string): Promise<UnresolvedPerson | null> {
  const { data, error } = await db()
    .from("unresolved_people")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertUnresolvedPerson(
  row: UnresolvedPersonInsert
): Promise<UnresolvedPerson> {
  const { data, error } = await db()
    .from("unresolved_people")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Mark an unresolved_people row as resolved by attaching it to a
 * specific employee. Caller is responsible for any follow-on inserts
 * (e.g. creating the training_records row that was waiting on this
 * resolution); this function only updates the queue row.
 */
export async function resolveUnresolvedPerson(
  id: string,
  resolvedToEmployeeId: string,
  resolvedBy?: string
): Promise<UnresolvedPerson> {
  const patch: UnresolvedPersonUpdate = {
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy ?? null,
    resolved_to_employee_id: resolvedToEmployeeId,
  };
  const { data, error } = await db()
    .from("unresolved_people")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ────────────────────────────────────────────────────────────
// unknown_trainings
// ────────────────────────────────────────────────────────────

export interface ListUnknownTrainingsOptions {
  openOnly?: boolean;
  importId?: string;
  source?: string;
}

export async function listUnknownTrainings(
  opts: ListUnknownTrainingsOptions = {}
): Promise<UnknownTraining[]> {
  let query = db().from("unknown_trainings").select("*");
  if (opts.openOnly) query = query.is("resolved_at", null);
  if (opts.importId) query = query.eq("import_id", opts.importId);
  if (opts.source) query = query.eq("source", opts.source);
  query = query.order("occurrence_count", { ascending: false }).order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getUnknownTraining(id: string): Promise<UnknownTraining | null> {
  const { data, error } = await db()
    .from("unknown_trainings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertUnknownTraining(
  row: UnknownTrainingInsert
): Promise<UnknownTraining> {
  const { data, error } = await db()
    .from("unknown_trainings")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Resolve an unknown_trainings row by mapping its raw_name to an existing
 * training_type. Side effects:
 *   1. Adds a training_aliases row pointing raw_name at the chosen training
 *      (with source matching the unknown_trainings row's source).
 *   2. Marks the unknown_trainings row as resolved.
 *
 * Does NOT backfill historical training_records that were previously
 * skipped because of this unknown training; that's a separate batch
 * operation owned by the resolver, which the resolution review UI calls
 * after this resolve completes.
 */
export async function resolveUnknownTraining(
  id: string,
  resolvedToTrainingTypeId: number,
  resolvedBy?: string
): Promise<UnknownTraining> {
  const row = await getUnknownTraining(id);
  if (!row) {
    throw new Error(`resolveUnknownTraining: ${id} not found`);
  }

  // 1. Persist the new alias.
  const aliasSource = (["paylocity", "phs", "access", "signin", "manual", "cutover"] as const).includes(
    row.source as never
  )
    ? (row.source as "paylocity" | "phs" | "access" | "signin" | "manual" | "cutover")
    : "manual";
  await addTrainingAlias(resolvedToTrainingTypeId, row.raw_name, aliasSource);

  // 2. Mark the row resolved.
  const patch: UnknownTrainingUpdate = {
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy ?? null,
    resolved_to_training_type_id: resolvedToTrainingTypeId,
  };
  const { data, error } = await db()
    .from("unknown_trainings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
