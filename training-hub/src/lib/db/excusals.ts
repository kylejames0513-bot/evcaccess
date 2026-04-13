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

/**
 * Denormalized shape for the admin "all excusals" view on
 * /required-trainings. Embeds the employee + training fields the
 * operator needs to actually recognize the row (name, department,
 * training name) so the UI doesn't have to cross-reference three
 * tables itself. Employee / training fields are nullable because the
 * underlying rows may have been deleted but the excusal (with ON
 * DELETE CASCADE) was still fetched mid-flight.
 */
export interface ExcusalWithDetails extends Excusal {
  employee_first_name: string | null;
  employee_last_name: string | null;
  employee_department: string | null;
  employee_position: string | null;
  employee_is_active: boolean | null;
  training_name: string | null;
  training_column_key: string | null;
}

/**
 * List every excusal in the table, joined to employee and training
 * metadata for display. Paginates to bypass the Supabase 1000-row cap
 * because the cutover merged_sheet import left ~11k rows in this
 * table and HR needs to see all of them.
 *
 * Joins are done in JS rather than via PostgREST embedding because
 * the generated Database types list Relationships: [] on excusals,
 * so the typed embed syntax would not compile. A separate fetch per
 * referenced table is fine at this row count and avoids N+1.
 */
export async function listAllExcusalsWithDetails(): Promise<ExcusalWithDetails[]> {
  const client = db();

  // 1. Pull every excusal row (paginated).
  const excusals: Excusal[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("excusals")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    excusals.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  if (excusals.length === 0) return [];

  // 2. Resolve the distinct employee_ids and training_type_ids.
  const employeeIds = [...new Set(excusals.map((e) => e.employee_id))];
  const trainingTypeIds = [...new Set(excusals.map((e) => e.training_type_id))];

  // 3. Batch-fetch the referenced employees. IN() lists over a few
  // hundred items start to feel slow, so paginate through employeeIds
  // in chunks.
  const CHUNK = 500;
  const employees: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    department: string | null;
    position: string | null;
    is_active: boolean | null;
  }[] = [];
  for (let i = 0; i < employeeIds.length; i += CHUNK) {
    const slice = employeeIds.slice(i, i + CHUNK);
    const { data, error } = await client
      .from("employees")
      .select("id, first_name, last_name, department, position, is_active")
      .in("id", slice);
    if (error) throw error;
    if (data) employees.push(...data);
  }

  const ttRes = await client
    .from("training_types")
    .select("id, name, column_key")
    .in("id", trainingTypeIds);
  if (ttRes.error) throw ttRes.error;
  const trainingTypes: { id: number; name: string; column_key: string }[] =
    ttRes.data ?? [];

  // 4. Build lookup maps and join.
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const ttMap = new Map(
    trainingTypes.map((t) => [t.id, t] as const)
  );

  return excusals.map((e) => {
    const emp = empMap.get(e.employee_id);
    const tt = ttMap.get(e.training_type_id);
    return {
      ...e,
      employee_first_name: emp?.first_name ?? null,
      employee_last_name: emp?.last_name ?? null,
      employee_department: emp?.department ?? null,
      employee_position: emp?.position ?? null,
      employee_is_active: emp?.is_active ?? null,
      training_name: tt?.name ?? null,
      training_column_key: tt?.column_key ?? null,
    };
  });
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
