import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  org_slug: z.string().min(1),
  raw_name: z.string().min(1),
  class_id: z
    .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.string().uuid())
    .optional(),
  raw_training: z.string().optional().default(""),
  device_info: z.string().optional().default(""),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { org_slug, raw_name, class_id, raw_training, device_info } = parsed.data;

  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", org_slug.toLowerCase())
      .maybeSingle();
    if (orgErr || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let resolvedClassId: string | null = class_id ?? null;
    if (resolvedClassId) {
      const { data: cls } = await admin
        .from("classes")
        .select("id")
        .eq("id", resolvedClassId)
        .eq("org_id", org.id)
        .maybeSingle();
      if (!cls) resolvedClassId = null;
    }

    const { data: inserted, error } = await admin
      .from("signin_sessions")
      .insert({
        org_id: org.id,
        class_id: resolvedClassId,
        employee_id: null,
        raw_name,
        raw_training: raw_training ?? "",
        device_info: device_info ?? "",
        resolved: false,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfiguration";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Server is not configured for public sign in yet." },
        { status: 503 }
      );
    }
    throw e;
  }
}
