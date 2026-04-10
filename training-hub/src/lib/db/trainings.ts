// ============================================================
// Trainings + training_aliases data access. Server-only.
// ============================================================
// Owns reads and writes for the training catalog and the alias
// dictionary that lets the resolver translate raw source strings
// into canonical training_type rows.
//
// The alias lookup is the hot path of the resolver: every imported
// training name flows through resolveTrainingByAlias. Keep it cheap.
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type {
  TrainingType,
  TrainingTypeInsert,
  TrainingTypeUpdate,
  TrainingAlias,
  TrainingAliasInsert,
  ImportSource,
} from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

// ────────────────────────────────────────────────────────────
// Training types
// ────────────────────────────────────────────────────────────

export async function getTrainingTypeById(id: number): Promise<TrainingType | null> {
  const { data, error } = await db()
    .from("training_types")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTrainingTypeByName(name: string): Promise<TrainingType | null> {
  const { data, error } = await db()
    .from("training_types")
    .select("*")
    .ilike("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTrainingTypeByColumnKey(columnKey: string): Promise<TrainingType | null> {
  const { data, error } = await db()
    .from("training_types")
    .select("*")
    .eq("column_key", columnKey)
    .order("id", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export interface ListTrainingTypesOptions {
  activeOnly?: boolean;
}

export async function listTrainingTypes(
  opts: ListTrainingTypesOptions = {}
): Promise<TrainingType[]> {
  let query = db().from("training_types").select("*");
  if (opts.activeOnly) {
    query = query.eq("is_active", true);
  }
  query = query.order("name");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function insertTrainingType(row: TrainingTypeInsert): Promise<TrainingType> {
  const { data, error } = await db()
    .from("training_types")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTrainingType(
  id: number,
  patch: TrainingTypeUpdate
): Promise<TrainingType> {
  const { data, error } = await db()
    .from("training_types")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ────────────────────────────────────────────────────────────
// Training aliases
// ────────────────────────────────────────────────────────────

/**
 * Resolve a raw training name (whatever the source system used) to a
 * canonical training_type row by walking the training_aliases dictionary
 * with case-insensitive matching, then falling back to the training_types
 * `name` column directly.
 *
 * Returns null if no alias and no direct match. Caller should send the row
 * to unknown_trainings if this returns null.
 */
export async function resolveTrainingByAlias(rawName: string): Promise<TrainingType | null> {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) return null;

  const client = db();

  // Try alias dictionary first (case-insensitive).
  const { data: aliasRows, error: aliasErr } = await client
    .from("training_aliases")
    .select("training_type_id")
    .ilike("alias", trimmed)
    .limit(1);
  if (aliasErr) throw aliasErr;
  if (aliasRows && aliasRows.length > 0) {
    return getTrainingTypeById(aliasRows[0].training_type_id);
  }

  // Fall back to direct name match.
  return getTrainingTypeByName(trimmed);
}

/**
 * Insert a new alias pointing at a training_type. Idempotent on the
 * (alias) unique constraint.
 */
export async function addTrainingAlias(
  trainingTypeId: number,
  alias: string,
  source: ImportSource = "manual"
): Promise<TrainingAlias | null> {
  const row: TrainingAliasInsert = {
    training_type_id: trainingTypeId,
    alias: alias.trim(),
    source,
  };
  const { data, error } = await db()
    .from("training_aliases")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) {
    // Postgres unique violation. Treat as idempotent.
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

export async function listTrainingAliases(trainingTypeId?: number): Promise<TrainingAlias[]> {
  let query = db().from("training_aliases").select("*");
  if (trainingTypeId != null) {
    query = query.eq("training_type_id", trainingTypeId);
  }
  query = query.order("alias");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Bulk insert aliases. Skips duplicates via per-row insert + 23505 catch
 * because PostgREST does not support ON CONFLICT DO NOTHING via the JS
 * client cleanly. Returns the count actually written.
 */
export async function addTrainingAliasesBulk(
  rows: TrainingAliasInsert[]
): Promise<number> {
  let added = 0;
  for (const row of rows) {
    const inserted = await addTrainingAlias(row.training_type_id, row.alias, (row.source as ImportSource | undefined) ?? "manual");
    if (inserted) added += 1;
  }
  return added;
}
