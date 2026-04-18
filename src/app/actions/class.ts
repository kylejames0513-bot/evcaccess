"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Build an ISO timestamp (no timezone suffix — treated as local by Postgres timestamptz).
 * We expect YYYY-MM-DD + HH:MM (24h) inputs from the form.
 */
function combineDateTime(date: string, time: string | null): string | null {
  if (!date) return null;
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  return `${date}T${t}:00`;
}

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
  if (profile.role === "viewer") {
    redirect("/classes/new?error=" + encodeURIComponent("Viewers cannot schedule."));
  }

  const training_id = String(formData.get("training_id") ?? "");
  const scheduled_date = String(formData.get("scheduled_date") ?? "");
  const start_time = String(formData.get("start_time") ?? "") || null;
  const end_time = String(formData.get("end_time") ?? "") || null;
  const location = String(formData.get("location") ?? "");
  const trainer_name = String(formData.get("trainer_name") ?? "");
  const capacityRaw = formData.get("capacity");
  const capacity =
    capacityRaw == null || capacityRaw === ""
      ? null
      : Number(capacityRaw);

  if (!training_id || !scheduled_date) {
    redirect("/classes/new?error=" + encodeURIComponent("Training and date are required."));
  }

  const scheduled_start = combineDateTime(scheduled_date, start_time);
  const scheduled_end = end_time ? combineDateTime(scheduled_date, end_time) : null;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      training_id,
      scheduled_start,
      scheduled_end,
      location: location || null,
      trainer_name: trainer_name || null,
      capacity: capacity != null && Number.isFinite(capacity) ? capacity : null,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/classes/new?error=" + encodeURIComponent(error?.message ?? "Save failed."));
  }
  revalidatePath("/classes");
  redirect(`/classes/${data.id}/day`);
}
