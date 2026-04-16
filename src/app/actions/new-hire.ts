"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STAGES = [
  "offer_accepted", "pre_hire_docs", "day_one_setup", "orientation",
  "thirty_day", "sixty_day", "ninety_day", "complete", "withdrew", "terminated_in_probation"
] as const;

// Default checklist per stage
const DEFAULT_CHECKLIST: Record<string, string[]> = {
  offer_accepted: [
    "Offer letter signed",
    "Background check authorized",
    "Reference checks completed",
  ],
  pre_hire_docs: [
    "I-9 form completed",
    "W-4 form completed",
    "Direct deposit form",
    "Emergency contact form",
    "Policy acknowledgements",
  ],
  day_one_setup: [
    "Badge issued",
    "Email account created",
    "Paylocity profile created",
    "Desk/workspace assigned",
    "Tour of facility",
  ],
  orientation: [
    "HR orientation completed",
    "Safety orientation completed",
    "Policies reviewed",
    "Mission & values reviewed",
  ],
  thirty_day: [
    "30-day check-in with supervisor",
    "Required trainings on track",
    "Onboarding paperwork complete",
  ],
  sixty_day: [
    "60-day check-in with supervisor",
    "Performance feedback collected",
  ],
  ninety_day: [
    "90-day review completed",
    "Probation status confirmed",
    "All required trainings current",
  ],
  complete: [],
};

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

  // Auto-create checklist for the new stage if it doesn't exist
  const items = DEFAULT_CHECKLIST[nextStage] ?? [];
  if (items.length > 0) {
    const { data: existing } = await supabase
      .from("new_hire_checklist")
      .select("item_name")
      .eq("new_hire_id", hireId)
      .eq("stage", nextStage);

    const existingNames = new Set((existing ?? []).map(e => e.item_name));
    const toInsert = items
      .filter(name => !existingNames.has(name))
      .map(name => ({
        new_hire_id: hireId,
        stage: nextStage,
        item_name: name,
        required: true,
        completed: false,
      }));

    if (toInsert.length > 0) {
      await supabase.from("new_hire_checklist").insert(toInsert);
    }
  }

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

  revalidatePath(`/new-hires/${hireId}`);
}

export async function addChecklistItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const hireId = String(formData.get("hire_id") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const itemName = String(formData.get("item_name") ?? "").trim();

  if (!hireId || !itemName) return;

  await supabase.from("new_hire_checklist").insert({
    new_hire_id: hireId,
    stage: stage || "offer_accepted",
    item_name: itemName,
    required: false,
  });

  revalidatePath(`/new-hires/${hireId}`);
}
