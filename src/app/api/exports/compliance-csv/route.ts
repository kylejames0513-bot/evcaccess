import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function esc(s: unknown): string {
  const str = String(s ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("vw_compliance_status")
    .select("paylocity_id, legal_last_name, legal_first_name, department, position, training_code, training_title, compliance_status, completed_on, expires_on, days_until_expiry")
    .limit(50000);

  const HEADER = ["Employee ID", "Last Name", "First Name", "Department", "Position", "Training", "Title", "Status", "Completed", "Expires", "Days Until Expiry"];
  const lines = [HEADER.join(",")];
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    lines.push([
      esc(r.paylocity_id),
      esc(r.legal_last_name),
      esc(r.legal_first_name),
      esc(r.department),
      esc(r.position),
      esc(r.training_code),
      esc(r.training_title),
      esc(r.compliance_status),
      esc(r.completed_on),
      esc(r.expires_on),
      esc(r.days_until_expiry),
    ].join(","));
  }

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
