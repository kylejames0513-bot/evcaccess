"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function resolveSigninSessionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (profile.role === "viewer") redirect("/signin-queue");

  const session_id = String(formData.get("session_id") ?? "").trim();
  const employee_id = String(formData.get("employee_id") ?? "").trim();
  if (!session_id || !employee_id) return;

  const { data: session } = await supabase
    .from("signin_sessions")
    .select("id, class_id, org_id")
    .eq("id", session_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!session) return;

  const { error } = await supabase
    .from("signin_sessions")
    .update({ employee_id, resolved: true })
    .eq("id", session_id);
  if (error) return;

  // If session has a class, create a completion record
  if (session.class_id) {
    const { data: cls } = await supabase
      .from("classes")
      .select("training_type_id, scheduled_date")
      .eq("id", session.class_id)
      .maybeSingle();
    if (cls) {
      await supabase.from("completions").insert({
        org_id: profile.org_id,
        employee_id,
        training_type_id: cls.training_type_id,
        completed_on: cls.scheduled_date,
        source: "signin",
        source_ref: session_id,
        recorded_by: user.id,
      });
    }
  }

  revalidatePath("/signin-queue");
  revalidatePath("/attendance-log");
}
