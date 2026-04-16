"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createClassAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (profile.role === "viewer") redirect("/classes/new?error=" + encodeURIComponent("Viewers cannot schedule."));

  const training_id = String(formData.get("training_id") ?? "");
  const scheduled_start = String(formData.get("scheduled_start") ?? "");
  const location = String(formData.get("location") ?? "");
  const trainer_name = String(formData.get("trainer_name") ?? "");
  const capacity = Number(formData.get("capacity") ?? 0);
  if (!training_id || !scheduled_start) {
    redirect("/classes/new?error=" + encodeURIComponent("Training and date are required."));
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      training_id,
      scheduled_start,
      location,
      trainer_name,
      capacity: Number.isFinite(capacity) ? capacity : null,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !data) redirect("/classes/new?error=" + encodeURIComponent(error?.message ?? "Save failed."));
  revalidatePath("/classes");
  redirect(`/classes/${data.id}/day`);
}
