import { createServerClient } from "@/lib/supabase";
import type { Json } from "@/types/database.generated";

export type PendingRosterKind = "new_hires_batch" | "separations_batch";
export type PendingRosterStatus = "pending" | "processing" | "approved" | "denied" | "failed";

export interface PendingRosterEventRow {
  id: string;
  kind: PendingRosterKind;
  payload: Json;
  status: PendingRosterStatus;
  source: string;
  error_message: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function insertPendingRosterEvent(input: {
  kind: PendingRosterKind;
  payload: Json;
}): Promise<{ id: string }> {
  const db = createServerClient();
  const { data, error } = await db
    .from("pending_roster_events")
    .insert({
      kind: input.kind,
      payload: input.payload,
      status: "pending",
      source: "excel_vba",
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert pending roster failed");
  return { id: (data as { id: string }).id };
}

export async function listPendingRosterEvents(status: PendingRosterStatus | "all" = "pending"): Promise<
  PendingRosterEventRow[]
> {
  const db = createServerClient();
  let q = db.from("pending_roster_events").select("*").order("created_at", { ascending: false }).limit(200);
  if (status === "pending") {
    // Show in-flight items in the pending queue so operators can see work
    // that has been claimed and is actively being applied.
    q = q.in("status", ["pending", "processing"]);
  } else if (status !== "all") {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingRosterEventRow[];
}

export async function getPendingRosterEventById(id: string): Promise<PendingRosterEventRow | null> {
  const db = createServerClient();
  const { data, error } = await db.from("pending_roster_events").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PendingRosterEventRow | null;
}

export async function updatePendingRosterEvent(
  id: string,
  patch: { status: PendingRosterStatus; resolution_note?: string | null; error_message?: string | null }
): Promise<void> {
  const db = createServerClient();
  const { error } = await db
    .from("pending_roster_events")
    .update({
      status: patch.status,
      resolution_note: patch.resolution_note ?? null,
      error_message: patch.error_message ?? null,
      resolved_at: patch.status === "pending" ? null : new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Atomically transition a pending event to processing.
 * Returns null when the row does not exist or is no longer pending.
 */
export async function claimPendingRosterEvent(id: string): Promise<PendingRosterEventRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("pending_roster_events")
    .update({
      status: "processing",
      error_message: null,
      resolution_note: null,
      resolved_at: null,
    } as never)
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PendingRosterEventRow | null;
}

/**
 * Atomically deny only if the event is still pending.
 * Returns false when already claimed/resolved or missing.
 */
export async function denyPendingRosterEvent(id: string, reason: string | null): Promise<boolean> {
  const db = createServerClient();
  const { data, error } = await db
    .from("pending_roster_events")
    .update({
      status: "denied",
      resolution_note: reason ?? "Denied from roster queue",
      error_message: null,
      resolved_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
