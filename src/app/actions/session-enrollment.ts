"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AddResult = { ok: boolean; added: number; skipped: number; error?: string };

async function getSupabaseOrRedirect() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

/**
 * Bulk add employees to a session's roster.
 * Accepts JSON form fields:
 *   session_id: uuid
 *   employee_ids: JSON array of uuids
 *   source: enrollment source tag
 */
export async function addEnrollmentsAction(formData: FormData): Promise<AddResult> {
  const supabase = await getSupabaseOrRedirect();
  const sessionId = String(formData.get("session_id") ?? "");
  const raw = String(formData.get("employee_ids") ?? "[]");
  const source = String(formData.get("source") ?? "manual");

  let employeeIds: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) employeeIds = parsed.filter((v) => typeof v === "string");
  } catch {
    return { ok: false, added: 0, skipped: 0, error: "Invalid employee_ids JSON" };
  }

  if (!sessionId || employeeIds.length === 0) {
    return { ok: false, added: 0, skipped: 0, error: "session_id and employee_ids required" };
  }

  const rows = employeeIds.map((id) => ({
    session_id: sessionId,
    employee_id: id,
    source,
    status: "enrolled",
  }));

  // Use upsert with ignore so re-adding an existing enrollment is a no-op.
  const { error, data } = await supabase
    .from("session_enrollments")
    .upsert(rows, {
      onConflict: "session_id,employee_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) return { ok: false, added: 0, skipped: 0, error: error.message };

  revalidatePath(`/classes/${sessionId}`);
  return {
    ok: true,
    added: data?.length ?? 0,
    skipped: employeeIds.length - (data?.length ?? 0),
  };
}

export async function updateEnrollmentStatusAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseOrRedirect();
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!enrollmentId || !status) return;

  await supabase
    .from("session_enrollments")
    .update({
      status,
      attendance_marked_at:
        status === "attended" || status === "no_show" || status === "excused"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", enrollmentId);

  const { data: enr } = await supabase
    .from("session_enrollments")
    .select("session_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (enr?.session_id) revalidatePath(`/classes/${enr.session_id}`);
}

export async function removeEnrollmentAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseOrRedirect();
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  if (!enrollmentId) return;

  const { data: enr } = await supabase
    .from("session_enrollments")
    .select("session_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  await supabase.from("session_enrollments").delete().eq("id", enrollmentId);

  if (enr?.session_id) revalidatePath(`/classes/${enr.session_id}`);
}
