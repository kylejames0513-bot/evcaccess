import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  org_slug: z.string().min(1),
  raw_name: z.string().min(1),
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
  const { raw_name, raw_training, device_info } = parsed.data;

  try {
    const admin = createSupabaseServiceRoleClient();

    const { data: inserted, error } = await admin
      .from("review_queue")
      .insert({
        source: "kiosk_signin",
        reason: "kiosk_signin",
        raw_payload: {
          raw_name,
          raw_training: raw_training ?? "",
          device_info: device_info ?? "",
        },
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
        { status: 503 },
      );
    }
    throw e;
  }
}
