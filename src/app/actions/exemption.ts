"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createExemptionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (profile.role === "viewer") redirect("/employees");

  const employee_id = String(formData.get("employee_id") ?? "").trim();
  const training_type_id = String(formData.get("training_type_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const expires_on = String(formData.get("expires_on") ?? "").trim() || null;

  if (!employee_id || !training_type_id || !reason) return;

  const { error } = await supabase.from("exemptions").insert({
    employee_id,
    training_type_id,
    reason,
    granted_by: user.id,
    expires_on,
  });

  if (error) return;
  revalidatePath(`/employees/${employee_id}`);
  revalidatePath("/compliance");
}

export async function deleteExemptionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (profile.role === "viewer") redirect("/employees");

  const exemption_id = String(formData.get("exemption_id") ?? "").trim();
  const employee_id = String(formData.get("employee_id") ?? "").trim();
  if (!exemption_id) return;

  const { error } = await supabase.from("exemptions").delete().eq("id", exemption_id);
  if (error) return;
  revalidatePath(`/employees/${employee_id}`);
  revalidatePath("/compliance");
}
