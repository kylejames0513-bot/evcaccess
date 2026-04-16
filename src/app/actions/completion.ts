"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logCompletionAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const trainingId = String(formData.get("training_id") ?? "").trim();
  const completedOn = String(formData.get("completed_on") ?? "").trim();

  if (!employeeId || !trainingId || !completedOn) return;

  await supabase.from("completions").insert({
    employee_id: employeeId,
    training_id: trainingId,
    completed_on: completedOn,
    status: "compliant",
    source: "manual",
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  revalidatePath("/compliance");
  revalidatePath("/attendance-log");
  revalidatePath(`/employees/${employeeId}`);
}
