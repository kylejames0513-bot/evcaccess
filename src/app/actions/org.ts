"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function bootstrapOrgAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const regulator = String(formData.get("regulator") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const fiscal = Number(formData.get("fiscal_year_start_month") ?? 7);
  if (!name || !slug) {
    return { error: "Organization name and URL slug are required." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("bootstrap_organization", {
    p_name: name,
    p_regulator: regulator,
    p_fiscal_month: Number.isFinite(fiscal) ? fiscal : 7,
    p_slug: slug,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { orgId: data as string };
}
