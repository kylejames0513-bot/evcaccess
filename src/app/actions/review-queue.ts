"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolve a review queue item by confirming a match to an employee.
 * Adds the raw name as an alias so future imports auto-match.
 */
export async function confirmMatchAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const itemId = String(formData.get("item_id") ?? "").trim();
  const employeeDbId = String(formData.get("employee_id") ?? "").trim();
  if (!itemId || !employeeDbId) return;

  // Fetch the review item
  const { data: item } = await supabase
    .from("review_queue")
    .select("raw_payload, reason")
    .eq("id", itemId)
    .maybeSingle();

  // Add alias if it was a name resolution issue
  if (item && item.reason === "name_not_resolved" && item.raw_payload) {
    const payload = item.raw_payload as Record<string, unknown>;
    const aliasLast = String(payload.lastName ?? "").trim();
    const aliasFirst = String(payload.firstName ?? "").trim();

    if (aliasLast || aliasFirst) {
      await supabase.from("name_aliases").insert({
        employee_id: employeeDbId,
        alias_last: aliasLast || null,
        alias_first: aliasFirst || null,
        source: "manual_confirm",
      });
    }
  }

  // Mark resolved
  await supabase
    .from("review_queue")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.email ?? "HR",
      resolution_notes: "Confirmed match + alias added",
    })
    .eq("id", itemId);

  revalidatePath("/review");
  revalidatePath("/ingestion");
}

export async function skipReviewItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const itemId = String(formData.get("item_id") ?? "").trim();
  if (!itemId) return;

  await supabase
    .from("review_queue")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.email ?? "HR",
      resolution_notes: "Skipped",
    })
    .eq("id", itemId);

  revalidatePath("/review");
  revalidatePath("/ingestion");
}

export async function bulkAcceptSuggestionsAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Auto-accept high-confidence suggested matches (score >= 0.85)
  const { data: items } = await supabase
    .from("review_queue")
    .select("id, raw_payload, suggested_match_employee_id, suggested_match_score, reason")
    .eq("resolved", false)
    .not("suggested_match_employee_id", "is", null)
    .gte("suggested_match_score", 0.85);

  if (!items || items.length === 0) return;

  for (const item of items) {
    if (!item.suggested_match_employee_id) continue;

    // Add alias
    if (item.reason === "name_not_resolved" && item.raw_payload) {
      const payload = item.raw_payload as Record<string, unknown>;
      const aliasLast = String(payload.lastName ?? "").trim();
      const aliasFirst = String(payload.firstName ?? "").trim();

      if (aliasLast || aliasFirst) {
        await supabase.from("name_aliases").insert({
          employee_id: item.suggested_match_employee_id,
          alias_last: aliasLast || null,
          alias_first: aliasFirst || null,
          source: "auto_accept",
        }).select().maybeSingle();
      }
    }

    await supabase
      .from("review_queue")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.email ?? "auto",
        resolution_notes: `Auto-accepted (${Math.round(Number(item.suggested_match_score) * 100)}% confidence)`,
      })
      .eq("id", item.id);
  }

  revalidatePath("/review");
  revalidatePath("/ingestion");
}
