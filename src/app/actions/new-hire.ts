"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { templateFor, type HireForTemplate } from "@/lib/onboarding-templates";

// Legacy stages retained so VBA keeps working; the UI no longer exposes them.
const STAGES = [
  "offer_accepted", "pre_hire_docs", "day_one_setup", "orientation",
  "thirty_day", "sixty_day", "ninety_day", "complete", "withdrew", "terminated_in_probation",
] as const;

/**
 * Seed the checklist for a hire from the template that matches their
 * hire_type / is_residential / conditional flags. Idempotent: existing
 * items keyed by item_key are updated (label/kind), missing ones inserted,
 * and items no longer in the template for this hire are left in place
 * (so we never destroy checked work).
 */
export async function seedChecklistForHire(hireId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: hire } = await supabase
    .from("new_hires")
    .select("id, hire_type, is_residential, lift_van_required, new_job_desc_required")
    .eq("id", hireId)
    .maybeSingle();

  if (!hire) return;

  const template = templateFor(hire as HireForTemplate);

  const { data: existing } = await supabase
    .from("new_hire_checklist")
    .select("id, item_key")
    .eq("new_hire_id", hireId);

  const existingByKey = new Map(
    (existing ?? []).filter((r) => r.item_key).map((r) => [r.item_key as string, r.id]),
  );

  const toInsert = template
    .filter((t) => !existingByKey.has(t.key))
    .map((t) => ({
      new_hire_id: hireId,
      item_key: t.key,
      item_name: t.label,
      kind: t.kind,
      required: t.kind === "required",
      completed: false,
      stage: "onboarding",
    }));

  if (toInsert.length > 0) {
    await supabase.from("new_hire_checklist").insert(toInsert);
  }

  // Update label/kind on existing items in case the template changed.
  for (const t of template) {
    const id = existingByKey.get(t.key);
    if (!id) continue;
    await supabase
      .from("new_hire_checklist")
      .update({ item_name: t.label, kind: t.kind, required: t.kind === "required" })
      .eq("id", id);
  }
}

export async function transitionStageAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const hireId = String(formData.get("hire_id") ?? "").trim();
  const nextStage = String(formData.get("next_stage") ?? "").trim();

  if (!hireId || !nextStage || !STAGES.includes(nextStage as (typeof STAGES)[number])) return;

  await supabase
    .from("new_hires")
    .update({
      stage: nextStage,
      stage_entry_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", hireId);

  revalidatePath("/new-hires");
  revalidatePath(`/new-hires/${hireId}`);
}

export async function toggleChecklistItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const itemId = String(formData.get("item_id") ?? "").trim();
  const hireId = String(formData.get("hire_id") ?? "").trim();
  const completed = formData.get("completed") === "true";

  await supabase
    .from("new_hire_checklist")
    .update({
      completed: !completed,
      completed_on: !completed ? new Date().toISOString().slice(0, 10) : null,
      completed_by: !completed ? (user.email ?? "HR") : null,
    })
    .eq("id", itemId);

  revalidatePath("/new-hires");
  if (hireId) revalidatePath(`/new-hires/${hireId}`);
}

export async function addChecklistItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const hireId = String(formData.get("hire_id") ?? "").trim();
  const itemName = String(formData.get("item_name") ?? "").trim();

  if (!hireId || !itemName) return;

  await supabase.from("new_hire_checklist").insert({
    new_hire_id: hireId,
    stage: "onboarding",
    item_name: itemName,
    required: false,
    kind: "required",
  });

  revalidatePath(`/new-hires/${hireId}`);
}
