"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createTrainingTypeAction(formData: FormData) {
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
  if (profile.role !== "admin") {
    redirect("/trainings/new?error=" + encodeURIComponent("Only admins can edit the catalog."));
  }
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const expiration_months = formData.get("expiration_months");
  const months =
    expiration_months === "" || expiration_months === null
      ? null
      : Number(expiration_months);
  const { error } = await supabase.from("training_types").insert({
    org_id: profile.org_id,
    name,
    category,
    expiration_months: Number.isFinite(months as number) ? (months as number) : null,
    description: String(formData.get("description") ?? ""),
    regulatory_source: String(formData.get("regulatory_source") ?? ""),
  });
  if (error) redirect("/trainings/new?error=" + encodeURIComponent(error.message));
  revalidatePath("/trainings");
  redirect("/trainings");
}
