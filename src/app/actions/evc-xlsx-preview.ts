"use server";

import { redirect } from "next/navigation";
import type { ImportPreview } from "@/lib/imports/types";
import { previewEvcMergedEmployeesFromXlsx, previewEvcTrainingMatrixFromXlsx } from "@/lib/imports/evc-xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_XLSX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

type Gate = { ok: true } | { error: string } | null;

async function gateImporter(): Promise<Gate> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { error: "Complete onboarding before importing." };
  if (profile.role === "viewer") return { error: "Viewers cannot import." };
  return { ok: true };
}

export async function previewEvcMergedEmployeesAction(formData: FormData): Promise<ImportPreview | { error: string }> {
  const gate = await gateImporter();
  if (gate === null) redirect("/login");
  if ("error" in gate) return { error: gate.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a non-empty .xlsx file." };
  }
  if (!ALLOWED_XLSX_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Only .xlsx workbooks are allowed." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: "File too large (max 25 MB)." };
  }

  try {
    const buf = await file.arrayBuffer();
    return previewEvcMergedEmployeesFromXlsx(buf, file.name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read workbook." };
  }
}

export async function previewEvcTrainingMatrixAction(formData: FormData): Promise<ImportPreview | { error: string }> {
  const gate = await gateImporter();
  if (gate === null) redirect("/login");
  if ("error" in gate) return { error: gate.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a non-empty .xlsx file." };
  }
  if (!ALLOWED_XLSX_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Only .xlsx workbooks are allowed." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: "File too large (max 25 MB)." };
  }

  try {
    const buf = await file.arrayBuffer();
    return previewEvcTrainingMatrixFromXlsx(buf, file.name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read workbook." };
  }
}
