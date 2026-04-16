"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createRequirementAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const trainingId = String(formData.get("training_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const daysStr = String(formData.get("required_within_days_of_hire") ?? "").trim();
  const days = daysStr ? parseInt(daysStr, 10) : null;

  if (!trainingId) return;

  await supabase.from("requirements").insert({
    training_id: trainingId,
    role,
    department,
    required_within_days_of_hire: days,
  });

  revalidatePath("/requirements");
  revalidatePath(`/trainings/${trainingId}`);
  revalidatePath("/compliance");
}

export async function deleteRequirementAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const reqId = String(formData.get("requirement_id") ?? "").trim();
  const trainingId = String(formData.get("training_id") ?? "").trim();

  if (!reqId) return;

  await supabase.from("requirements").delete().eq("id", reqId);

  revalidatePath("/requirements");
  if (trainingId) revalidatePath(`/trainings/${trainingId}`);
  revalidatePath("/compliance");
}

export async function createExclusionAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const trainingId = String(formData.get("training_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!trainingId) return;
  if (!role && !department) return; // must exclude something specific

  await supabase.from("exclusions").insert({
    training_id: trainingId,
    role,
    department,
    reason,
  });

  revalidatePath("/requirements");
  revalidatePath("/compliance");
}

export async function deleteExclusionAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const excId = String(formData.get("exclusion_id") ?? "").trim();
  if (!excId) return;

  await supabase.from("exclusions").delete().eq("id", excId);

  revalidatePath("/requirements");
  revalidatePath("/compliance");
}
