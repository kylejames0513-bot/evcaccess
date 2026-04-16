"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { commitImportPreview } from "@/lib/imports/commit";
import type { ImportPreview } from "@/lib/imports/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const previewSchema = z.object({
  source: z.enum([
    "paylocity",
    "phs",
    "manual_csv",
    "evc_training_xlsx",
    "evc_merged_employees_xlsx",
  ]),
  filename: z.string(),
  rows: z.array(
    z.object({
      key: z.string(),
      employeePaylocityId: z.string().optional(),
      employeeName: z.string().optional(),
      employeeFirstName: z.string().optional(),
      employeeLastName: z.string().optional(),
      hireDate: z.string().optional(),
      employeeStatus: z.enum(["active", "on_leave", "terminated"]).optional(),
      location: z.string().optional(),
      employeeDepartment: z.string().optional(),
      employeePosition: z.string().optional(),
      trainingName: z.string().optional(),
      completedOn: z.string().optional(),
      action: z.enum([
        "insert_completion",
        "noop_duplicate",
        "unresolved_person",
        "unknown_training",
        "upsert_employee",
        "invalid_employee_row",
      ]),
      detail: z.string().optional(),
    })
  ),
  counts: z.object({
    wouldInsert: z.number(),
    wouldUpdate: z.number(),
    noop: z.number(),
    unresolvedPeople: z.number(),
    unknownTrainings: z.number(),
    wouldUpsertEmployees: z.number(),
    invalidEmployeeRows: z.number(),
  }),
});

export async function commitImportAction(json: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (profile.role === "viewer") redirect("/imports?error=" + encodeURIComponent("Viewers cannot import."));

  let preview: ImportPreview;
  try {
    preview = previewSchema.parse(JSON.parse(json)) as ImportPreview;
  } catch {
    redirect("/imports?error=" + encodeURIComponent("Invalid preview payload."));
  }

  await commitImportPreview({
    supabase,
    orgId: profile.org_id,
    preview,
    triggeredBy: profile.id,
  });

  revalidatePath("/imports");
  revalidatePath("/compliance");
  revalidatePath("/review");
  revalidatePath("/employees");
  redirect("/imports?success=1");
}
