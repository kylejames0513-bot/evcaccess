"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createClassAction(formData: FormData) {
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

  const training_type_id = String(formData.get("training_type_id") ?? "");
  const scheduled_date = String(formData.get("scheduled_date") ?? "");
  const location = String(formData.get("location") ?? "");
  const instructor = String(formData.get("instructor") ?? "");
  const capacity = Number(formData.get("capacity") ?? 0);
  if (!training_type_id || !scheduled_date) {
    redirect("/classes/new?error=" + encodeURIComponent("Training and date are required."));
  }

  const { data, error } = await supabase
    .from("classes")
    .insert({
      org_id: profile.org_id,
      training_type_id,
      scheduled_date,
      location,
      instructor,
      capacity: Number.isFinite(capacity) ? capacity : 0,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !data) redirect("/classes/new?error=" + encodeURIComponent(error?.message ?? "Save failed."));
  revalidatePath("/classes");
  redirect(`/classes/${data.id}/day`);
}
