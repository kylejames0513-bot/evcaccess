"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createSeparationAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const legalName = String(formData.get("legal_name") ?? "").trim();
  const separationDate = String(formData.get("separation_date") ?? "").trim();
  if (!legalName || !separationDate) {
    redirect("/separations/new?error=Name+and+date+required");
  }

  const record = {
    legal_name: legalName,
    position: String(formData.get("position") ?? "").trim() || null,
    department: String(formData.get("department") ?? "").trim() || null,
    hire_date: String(formData.get("hire_date") ?? "").trim() || null,
    separation_date: separationDate,
    separation_type: String(formData.get("separation_type") ?? "voluntary"),
    reason_primary: String(formData.get("reason_primary") ?? "").trim() || null,
    rehire_eligible: String(formData.get("rehire_eligible") ?? "conditional"),
    exit_interview_status: String(formData.get("exit_interview_status") ?? "not_done"),
    hr_notes: String(formData.get("hr_notes") ?? "").trim() || null,
    supervisor_name_raw: String(formData.get("supervisor_name_raw") ?? "").trim() || null,
    ingest_source: "hub_manual",
  };

  const { data: inserted, error } = await supabase
    .from("separations")
    .insert(record)
    .select("id, legal_name, separation_date, hire_date, department, position, separation_type, reason_primary, rehire_eligible, exit_interview_status, hr_notes, supervisor_name_raw")
    .single();

  if (error || !inserted) {
    redirect("/separations/new?error=" + encodeURIComponent(error?.message ?? "save failed"));
  }

  // Queue an xlsx writeback so the operator can run
  // `npm run writeback:separations` locally to append to the FY Separation
  // workbook. Don't block the save if the queue insert fails.
  try {
    await supabase.from("pending_xlsx_writes").insert({
      source: "separation_summary",
      action: "upsert",
      payload: {
        ...inserted,
        actor: user.email ?? "hr",
      },
    });
  } catch (e) {
    // swallow — we keep the Supabase write; the operator will notice the
    // banner stays absent and can re-queue manually from the detail page.
    console.error("pending_xlsx_writes insert failed", e);
  }

  revalidatePath("/separations");
  revalidatePath("/ingestion");
  redirect(`/separations/${inserted.id}`);
}

const DEFAULT_OFFBOARDING: string[] = [
  "Exit interview scheduled/completed",
  "Badge collected",
  "Keys returned",
  "Laptop/equipment returned",
  "Accounts disabled (Email, Paylocity, etc.)",
  "Final paycheck processed",
  "PTO payout calculated",
  "Benefits termination notice sent",
  "COBRA notice mailed",
  "Personnel file archived",
];

export async function toggleOffboardingItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const itemId = String(formData.get("item_id") ?? "").trim();
  const sepId = String(formData.get("separation_id") ?? "").trim();
  const completed = formData.get("completed") === "true";

  await supabase
    .from("offboarding_checklist")
    .update({
      completed: !completed,
      completed_on: !completed ? new Date().toISOString().slice(0, 10) : null,
      completed_by: !completed ? (user.email ?? "HR") : null,
    })
    .eq("id", itemId);

  revalidatePath(`/separations/${sepId}`);
}

export async function generateOffboardingChecklistAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const sepId = String(formData.get("separation_id") ?? "").trim();
  if (!sepId) return;

  // Check if checklist already exists
  const { count } = await supabase
    .from("offboarding_checklist")
    .select("id", { count: "exact", head: true })
    .eq("separation_id", sepId);

  if (count && count > 0) return;

  // Insert default items
  await supabase.from("offboarding_checklist").insert(
    DEFAULT_OFFBOARDING.map(name => ({
      separation_id: sepId,
      item_name: name,
      required: true,
      completed: false,
    }))
  );

  revalidatePath(`/separations/${sepId}`);
}

export async function addOffboardingItemAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const sepId = String(formData.get("separation_id") ?? "").trim();
  const itemName = String(formData.get("item_name") ?? "").trim();

  if (!sepId || !itemName) return;

  await supabase.from("offboarding_checklist").insert({
    separation_id: sepId,
    item_name: itemName,
    required: false,
  });

  revalidatePath(`/separations/${sepId}`);
}
