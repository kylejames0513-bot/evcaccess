"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PassFail } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  enrollmentId: z.string().uuid(),
  classId: z.string().uuid(),
  attended: z.enum(["unset", "yes", "no"]),
  pass_fail: z.enum(["unset", "pass", "fail", "no_show"]),
});

function attendedFromField(v: z.infer<typeof inputSchema>["attended"]): boolean | null {
  if (v === "unset") return null;
  return v === "yes";
}

function passFailFromField(v: z.infer<typeof inputSchema>["pass_fail"]): PassFail | null {
  if (v === "unset") return null;
  return v;
}

export async function updateClassEnrollmentAttendanceAction(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    enrollmentId: formData.get("enrollment_id"),
    classId: formData.get("class_id"),
    attended: formData.get("attended"),
    pass_fail: formData.get("pass_fail"),
  });
  if (!parsed.success) return;
  const { enrollmentId, classId, attended, pass_fail } = parsed.data;

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
  if (profile.role === "viewer") return;

  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!cls) return;

  const attendedVal = attendedFromField(attended);
  const passFailVal = passFailFromField(pass_fail);

  const { error } = await supabase
    .from("class_enrollments")
    .update({
      attended: attendedVal,
      pass_fail: passFailVal,
    })
    .eq("id", enrollmentId)
    .eq("class_id", classId);

  if (error) return;

  revalidatePath(`/classes/${classId}/day`);
  revalidatePath("/classes");
}
