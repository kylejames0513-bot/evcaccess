"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createEmployeeAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const employee_id = String(formData.get("paylocity_id") ?? formData.get("employee_id") ?? "").trim();
  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const hire_date = String(formData.get("hire_date") ?? "").trim();

  if (!employee_id || !first_name || !last_name) {
    redirect("/employees/new?error=" + encodeURIComponent("Employee ID and name are required."));
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      employee_id,
      legal_first_name: first_name,
      legal_last_name: last_name,
      position: position || null,
      department: department || null,
      location: location || null,
      hire_date: hire_date || null,
      status: "active",
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/employees/new?error=" + encodeURIComponent(error?.message ?? "Could not save."));
  }

  revalidatePath("/employees");
  redirect(`/employees/${data.id}`);
}
