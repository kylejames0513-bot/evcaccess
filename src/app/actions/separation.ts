"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_OFFBOARDING: string[] = [
  "Exit interview scheduled/completed",
  "Badge collected",
  "Keys returned",
  "Laptop/equipment returned",
  "Accounts disabled (Email, Paylocity, etc.)",
  "Final paycheck processed",
  "PTO payout calculated",
  "Benefits termination notice sent",
  "COBRA notice mailed",
  "Personnel file archived",
];

export async function toggleOffboardingItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const itemId = String(formData.get("item_id") ?? "").trim();
  const sepId = String(formData.get("separation_id") ?? "").trim();
  const completed = formData.get("completed") === "true";

  await supabase
    .from("offboarding_checklist")
    .update({
      completed: !completed,
      completed_on: !completed ? new Date().toISOString().slice(0, 10) : null,
      completed_by: !completed ? (user.email ?? "HR") : null,
    })
    .eq("id", itemId);

  revalidatePath(`/separations/${sepId}`);
}

export async function generateOffboardingChecklistAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const sepId = String(formData.get("separation_id") ?? "").trim();
  if (!sepId) return;

  // Check if checklist already exists
  const { count } = await supabase
    .from("offboarding_checklist")
    .select("id", { count: "exact", head: true })
    .eq("separation_id", sepId);

  if (count && count > 0) return;

  // Insert default items
  await supabase.from("offboarding_checklist").insert(
    DEFAULT_OFFBOARDING.map(name => ({
      separation_id: sepId,
      item_name: name,
      required: true,
      completed: false,
    }))
  );

  revalidatePath(`/separations/${sepId}`);
}

export async function addOffboardingItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const sepId = String(formData.get("separation_id") ?? "").trim();
  const itemName = String(formData.get("item_name") ?? "").trim();

  if (!sepId || !itemName) return;

  await supabase.from("offboarding_checklist").insert({
    separation_id: sepId,
    item_name: itemName,
    required: false,
  });

  revalidatePath(`/separations/${sepId}`);
}
