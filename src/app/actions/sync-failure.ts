"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { postWriteback, type WritebackAction } from "@/lib/sheet-writeback";

export async function retrySyncFailureAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { data: row } = await supabase
    .from("sync_failures")
    .select("id, kind, target, payload, attempts")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;

  if (row.target === "google_sheet") {
    const { ok, error } = await postWriteback(
      row.kind as WritebackAction,
      (row.payload ?? {}) as Record<string, unknown>,
      { supabase },
    );
    if (ok) {
      await supabase
        .from("sync_failures")
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.email ?? "hr",
          resolution_notes: "retry succeeded",
        })
        .eq("id", id);
    } else {
      await supabase
        .from("sync_failures")
        .update({
          attempts: (row.attempts ?? 1) + 1,
          last_attempt_at: new Date().toISOString(),
          error: error ?? null,
        })
        .eq("id", id);
    }
  }

  revalidatePath("/ingestion");
}

export async function dismissSyncFailureAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase
    .from("sync_failures")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.email ?? "hr",
      resolution_notes: "dismissed by operator",
    })
    .eq("id", id);

  revalidatePath("/ingestion");
}
