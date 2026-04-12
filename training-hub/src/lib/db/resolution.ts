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
  ImportSource,
} from "@/types/database";
import { addTrainingAlias } from "@/lib/db/trainings";
import { matchTraining, phsRawName, paylocityRawName } from "@/lib/resolver/training-match";
import { parseDate } from "@/lib/resolver/date-parse";

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
  reason?: string;
  search?: string;   // matches first_name / last_name / full_name
  page?: number;     // 1-based
  pageSize?: number; // default 50, max 500
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listUnresolvedPeople(
  opts: ListUnresolvedPeopleOptions = {}
): Promise<PaginatedResult<UnresolvedPerson>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, opts.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db()
    .from("unresolved_people")
    .select("*", { count: "exact" });
  if (opts.openOnly) query = query.is("resolved_at", null);
  if (opts.importId) query = query.eq("import_id", opts.importId);
  if (opts.source) query = query.eq("source", opts.source);
  if (opts.reason) query = query.eq("reason", opts.reason);
  if (opts.search && opts.search.trim()) {
    const needle = `%${opts.search.trim().replace(/[%,]/g, "")}%`;
    query = query.or(
      `full_name.ilike.${needle},first_name.ilike.${needle},last_name.ilike.${needle},paylocity_id.ilike.${needle}`
    );
  }
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageSize };
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

/**
 * After resolving an unresolved_people row to a specific employee,
 * re-extract the training info from raw_payload and insert the
 * training_record that was missed during the original import.
 *
 * Returns the training_record id if created, or null if the raw_payload
 * didn't contain enough info (special_status, unknown training, missing
 * dates, etc.). Uses ON CONFLICT DO NOTHING so it's safe to call on
 * records that have already been backfilled.
 */
export async function backfillTrainingRecord(
  row: UnresolvedPerson,
  employeeId: string
): Promise<string | null> {
  // special_status rows (Med Admin No Show / Fail) are not completions.
  if (row.reason === "special_status") return null;

  const payload = row.raw_payload as Record<string, unknown> | null;
  if (!payload) return null;

  const source = row.source as ImportSource;
  let trainingRawName: string | null = null;
  let completionDateRaw: unknown = null;
  let expirationDateRaw: unknown = null;

  if (source === "phs") {
    const decision = phsRawName(
      payload["Upload Category"] as string | undefined,
      payload["Upload Type"] as string | undefined
    );
    if (!decision || "specialStatus" in decision) return null;
    trainingRawName = decision.name;
    completionDateRaw = payload["Effective Date"];
    expirationDateRaw = payload["Expiration Date"];
  } else if (source === "paylocity") {
    trainingRawName = paylocityRawName(
      payload["Skill"] as string | undefined,
      payload["Code"] as string | undefined
    );
    completionDateRaw = payload["Effective/Issue Date"];
    expirationDateRaw = payload["Expiration Date"];
  } else if (source === "signin") {
    trainingRawName = (payload["trainingSession"] as string) ?? null;
    completionDateRaw = payload["dateOfTraining"];
  } else {
    // access / cutover / manual — raw_payload shapes vary too much
    // for generic backfill. Skip for now.
    return null;
  }

  if (!trainingRawName) return null;

  const trainingOutcome = await matchTraining(source, trainingRawName);
  if (trainingOutcome.kind !== "matched") return null;

  const completionDate = parseDate(completionDateRaw as string | number | Date | null);
  if (!completionDate) return null;
  const expirationDate = parseDate(expirationDateRaw as string | number | Date | null);

  const { data, error } = await db()
    .from("training_records")
    .upsert(
      {
        employee_id: employeeId,
        training_type_id: trainingOutcome.trainingType.id,
        completion_date: completionDate,
        expiration_date: expirationDate ?? null,
        source,
        notes: `Backfilled from resolved unresolved_people ${row.id}`,
      },
      { onConflict: "employee_id,training_type_id,completion_date", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

// ────────────────────────────────────────────────────────────
// unknown_trainings
// ────────────────────────────────────────────────────────────

export interface ListUnknownTrainingsOptions {
  openOnly?: boolean;
  importId?: string;
  source?: string;
  search?: string;   // matches raw_name
  page?: number;
  pageSize?: number;
}

export async function listUnknownTrainings(
  opts: ListUnknownTrainingsOptions = {}
): Promise<PaginatedResult<UnknownTraining>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, opts.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db()
    .from("unknown_trainings")
    .select("*", { count: "exact" });
  if (opts.openOnly) query = query.is("resolved_at", null);
  if (opts.importId) query = query.eq("import_id", opts.importId);
  if (opts.source) query = query.eq("source", opts.source);
  if (opts.search && opts.search.trim()) {
    const needle = `%${opts.search.trim().replace(/[%,]/g, "")}%`;
    query = query.ilike("raw_name", needle);
  }
  query = query
    .order("occurrence_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageSize };
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
