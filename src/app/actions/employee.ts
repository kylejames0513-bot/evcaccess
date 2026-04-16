"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export async function createEmployeeAction(formData: FormData) {
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
    redirect("/employees/new?error=" + encodeURIComponent("Viewers cannot add employees."));
  }

  const paylocity_id = String(formData.get("paylocity_id") ?? "").trim();
  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const hire_date = String(formData.get("hire_date") ?? "").trim();
  if (!paylocity_id || !first_name || !last_name || !hire_date) {
    redirect(
      "/employees/new?error=" + encodeURIComponent("Paylocity ID, name, and hire date are required.")
    );
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      org_id: profile.org_id,
      paylocity_id,
      first_name,
      last_name,
      position,
      location,
      hire_date,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/employees/new?error=" + encodeURIComponent(error?.message ?? "Could not save."));
  }

  await writeAuditLog(supabase, {
    org_id: profile.org_id,
    actor_id: user.id,
    action: "employee.create",
    entity_type: "employees",
    entity_id: data.id,
    before_data: null,
    after_data: { paylocity_id, first_name, last_name },
  });

  revalidatePath("/employees");
  redirect(`/employees/${data.id}`);
}
