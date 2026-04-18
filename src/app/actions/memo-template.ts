"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getSupabaseOrRedirect() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

export async function saveMemoTemplateAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseOrRedirect();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject_template") ?? "");
  const body = String(formData.get("body_template") ?? "");
  const active = formData.get("active") === "on" || formData.get("active") === "true";

  if (!id || !name) return;

  await supabase
    .from("memo_templates")
    .update({
      name,
      subject_template: subject,
      body_template: body,
      active,
    })
    .eq("id", id);

  revalidatePath("/settings/memos");
}

export async function setDefaultMemoTemplateAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseOrRedirect();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Clear existing default first (partial-unique index won't let us have two).
  await supabase.from("memo_templates").update({ is_default: false }).eq("is_default", true);
  await supabase.from("memo_templates").update({ is_default: true }).eq("id", id);

  revalidatePath("/settings/memos");
}

export async function saveMemoSignoffAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseOrRedirect();
  const signoff = String(formData.get("memo_signoff") ?? "").trim();

  // Single-org schema — update all rows (there will only ever be one).
  const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
  const orgId = orgs?.[0]?.id;
  if (!orgId) return;

  await supabase
    .from("organizations")
    .update({ memo_signoff: signoff || null })
    .eq("id", orgId);

  revalidatePath("/settings/memos");
  revalidatePath("/classes");
}

export async function duplicateMemoTemplateAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseOrRedirect();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { data: src } = await supabase
    .from("memo_templates")
    .select("name, subject_template, body_template")
    .eq("id", id)
    .maybeSingle();
  if (!src) return;

  const slug = `custom_${Date.now().toString(36)}`;
  await supabase.from("memo_templates").insert({
    slug,
    name: `${src.name} (copy)`,
    subject_template: src.subject_template,
    body_template: src.body_template,
    active: true,
    is_default: false,
  });

  revalidatePath("/settings/memos");
}
