"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function addExemptionAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const trainingId = String(formData.get("training_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "Exempted by HR";

  if (!employeeId || !trainingId) return;

  await supabase.from("completions").insert({
    employee_id: employeeId,
    training_id: trainingId,
    status: "exempt",
    exempt_reason: reason,
    source: "manual_exemption",
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/compliance");
}

export async function removeExemptionAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const completionId = String(formData.get("completion_id") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim();

  if (!completionId) return;

  await supabase.from("completions").delete().eq("id", completionId);

  if (employeeId) revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/compliance");
}
