"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createTrainingTypeAction(formData: FormData): Promise<void> {
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

  const code = String(formData.get("code") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const cadence_type = String(formData.get("cadence_type") ?? "recurring").trim();
  const cadence_months_raw = formData.get("cadence_months");
  const cadence_months =
    cadence_months_raw === "" || cadence_months_raw === null
      ? null
      : Number(cadence_months_raw);

  if (!code || !title) {
    redirect("/trainings/new?error=" + encodeURIComponent("Code and title are required."));
  }

  const { error } = await supabase.from("trainings").insert({
    code,
    title,
    category,
    cadence_type,
    cadence_months: Number.isFinite(cadence_months as number) ? (cadence_months as number) : null,
    description: String(formData.get("description") ?? ""),
    regulatory_citation: String(formData.get("regulatory_citation") ?? "") || null,
  });
  if (error) redirect("/trainings/new?error=" + encodeURIComponent(error.message));
  revalidatePath("/trainings");
  redirect("/trainings");
}
