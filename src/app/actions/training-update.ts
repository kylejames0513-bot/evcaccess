"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrainingUpdateFields = {
  title?: string;
  category?: string;
  cadence_type?: "unset" | "one_time" | "monthly" | "annual" | "biennial" | "custom";
  cadence_months?: number | null;
  grace_days?: number;
  regulatory_citation?: string;
  active?: boolean;
};

export async function updateTrainingAction(
  trainingId: string,
  fields: TrainingUpdateFields
): Promise<{ ok: true; rowsUpdated?: number } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Check if cadence is changing (triggers recompute)
  const { data: before } = await supabase
    .from("trainings")
    .select("cadence_type, cadence_months")
    .eq("id", trainingId)
    .maybeSingle();

  const { error } = await supabase
    .from("trainings")
    .update(fields)
    .eq("id", trainingId);

  if (error) return { ok: false, error: error.message };

  // If cadence changed, the DB trigger auto-recomputes expirations
  // Count how many rows were updated
  let rowsUpdated: number | undefined;
  const cadenceChanged =
    before &&
    ((fields.cadence_type !== undefined && fields.cadence_type !== before.cadence_type) ||
      (fields.cadence_months !== undefined && fields.cadence_months !== before.cadence_months));

  if (cadenceChanged) {
    const { count } = await supabase
      .from("completions")
      .select("id", { count: "exact", head: true })
      .eq("training_id", trainingId);
    rowsUpdated = count ?? 0;
  }

  revalidatePath("/trainings");
  revalidatePath("/compliance");
  revalidatePath("/dashboard");
  return { ok: true, rowsUpdated };
}

export async function createTrainingAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;

  if (!code || !title) return;

  await supabase.from("trainings").insert({
    code,
    title,
    category,
    cadence_type: "unset",
    active: true,
  });

  revalidatePath("/trainings");
}
