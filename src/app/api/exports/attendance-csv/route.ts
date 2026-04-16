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

  const { data: completions } = await supabase
    .from("completions")
    .select("employee_id, training_id, completed_on, expires_on, status, source, notes")
    .order("completed_on", { ascending: false })
    .limit(50000);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_last_name, legal_first_name, department");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title");

  const empMap = new Map(employees?.map(e => [e.id, e]) ?? []);
  const trMap = new Map(trainings?.map(t => [t.id, t]) ?? []);

  const HEADER = ["Date", "Employee ID", "Last Name", "First Name", "Department", "Training Code", "Training", "Status", "Expires", "Source", "Notes"];
  const lines = [HEADER.join(",")];
  for (const c of completions ?? []) {
    const emp = empMap.get(c.employee_id);
    const tr = trMap.get(c.training_id);
    lines.push([
      esc(c.completed_on),
      esc(emp?.employee_id),
      esc(emp?.legal_last_name),
      esc(emp?.legal_first_name),
      esc(emp?.department),
      esc(tr?.code),
      esc(tr?.title),
      esc(c.status),
      esc(c.expires_on),
      esc(c.source),
      esc(c.notes),
    ].join(","));
  }

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
