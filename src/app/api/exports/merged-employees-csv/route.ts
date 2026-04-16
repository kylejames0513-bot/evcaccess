import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Allowlisted headers aligned with EVC `Merged` sheet for round-trip with Excel. */
const HEADER = ["ID", "L NAME", "F NAME", "ACTIVE", "Division", "Hire Date"] as const;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("employees")
    .select("employee_id, legal_last_name, legal_first_name, status, location, hire_date")
    .order("legal_last_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lines = [HEADER.join(",")];
  for (const r of rows ?? []) {
    const active =
      r.status === "active" ? "YES" : r.status === "on_leave" ? "LOA" : "NO";
    const cells = [
      csvEscape(r.employee_id ?? ""),
      csvEscape(r.legal_last_name ?? ""),
      csvEscape(r.legal_first_name ?? ""),
      csvEscape(active),
      csvEscape(r.location ?? ""),
      csvEscape(r.hire_date ?? ""),
    ];
    lines.push(cells.join(","));
  }

  const body = lines.join("\r\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="merged-employees-export.csv"',
    },
  });
}
