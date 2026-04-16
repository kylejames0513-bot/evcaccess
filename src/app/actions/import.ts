"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { commitImportPreview } from "@/lib/imports/commit";
import type { ImportPreview } from "@/lib/imports/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const previewSchema = z.object({
  source: z.enum(["paylocity", "phs", "manual_csv"]),
  filename: z.string(),
  rows: z.array(
    z.object({
      key: z.string(),
      employeePaylocityId: z.string().optional(),
      employeeName: z.string().optional(),
      trainingName: z.string().optional(),
      completedOn: z.string().optional(),
      action: z.enum([
        "insert_completion",
        "noop_duplicate",
        "unresolved_person",
        "unknown_training",
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
  redirect("/imports?success=1");
}
