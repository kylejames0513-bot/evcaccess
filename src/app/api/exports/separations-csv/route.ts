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
    .from("separations")
    .select("legal_name, position, department, hire_date, separation_date, tenure_days, separation_type, reason_primary, reason_secondary, rehire_eligible, exit_interview_status, calendar_year, evc_fiscal_year, hr_notes")
    .order("separation_date", { ascending: false });

  const HEADER = [
    "Name", "Position", "Department", "Hire Date", "Separation Date", "Tenure (days)",
    "Type", "Reason (primary)", "Reason (secondary)", "Rehire Eligible", "Exit Interview",
    "Calendar Year", "EVC FY", "HR Notes",
  ];
  const lines = [HEADER.join(",")];
  for (const r of data ?? []) {
    lines.push([
      esc(r.legal_name),
      esc(r.position),
      esc(r.department),
      esc(r.hire_date),
      esc(r.separation_date),
      esc(r.tenure_days),
      esc(r.separation_type),
      esc(r.reason_primary),
      esc(r.reason_secondary),
      esc(r.rehire_eligible),
      esc(r.exit_interview_status),
      esc(r.calendar_year),
      esc(r.evc_fiscal_year),
      esc(r.hr_notes),
    ].join(","));
  }

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="separations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
