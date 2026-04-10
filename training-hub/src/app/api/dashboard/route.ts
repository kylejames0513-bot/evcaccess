import { getComplianceSummary, listCompliance } from "@/lib/db/compliance";
import { getEmployeeCounts } from "@/lib/db/employees";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const db = createServerClient();

    const [summary, employeeCounts] = await Promise.all([
      getComplianceSummary(),
      getEmployeeCounts(),
    ]);

    // Fetch scheduled sessions with training name and enrolled employee names
    const { data: sessions, error: sessErr } = await db
      .from("training_sessions")
      .select("id, session_date, start_time, location, capacity, training_type_id")
      .eq("status", "scheduled")
      .order("session_date", { ascending: true })
      .limit(10);
    if (sessErr) throw sessErr;

    // Get training names for these sessions
    const typeIds = [...new Set((sessions ?? []).map(s => s.training_type_id))];
    const { data: types } = typeIds.length > 0
      ? await db.from("training_types").select("id, name").in("id", typeIds)
      : { data: [] };
    const typeMap = new Map((types ?? []).map(t => [t.id, t.name]));

    // Get enrollments with employee names
    const sessionIds = (sessions ?? []).map(s => s.id);
    const { data: enrollments } = sessionIds.length > 0
      ? await db
          .from("enrollments")
          .select("session_id, employees(first_name, last_name)")
          .in("session_id", sessionIds)
      : { data: [] };

    const enrolledBySession = new Map<string, string[]>();
    for (const e of enrollments ?? []) {
      const emp = e.employees as unknown as { first_name: string; last_name: string } | null;
      const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : "Unknown";
      const list = enrolledBySession.get(e.session_id) ?? [];
      list.push(name);
      enrolledBySession.set(e.session_id, list);
    }

    const upcoming = (sessions ?? []).slice(0, 6).map(s => ({
      training: typeMap.get(s.training_type_id) ?? "Unknown",
      date: s.session_date,
      time: s.start_time ?? "",
      enrolled: enrolledBySession.get(s.id) ?? [],
      capacity: s.capacity,
    }));

    // Urgent compliance issues
    const expiredRows = await listCompliance({ status: "expired" });
    const expiringRows = await listCompliance({ status: "expiring_soon" });
    const urgent = [...expiredRows, ...expiringRows]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "expired" ? -1 : 1;
        return (a.expiration_date ?? "").localeCompare(b.expiration_date ?? "");
      })
      .slice(0, 8)
      .map((row) => ({
        employee: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
        training: row.training_name ?? "",
        status: row.status ?? "needed",
        date: row.completion_date ?? null,
        expirationDate: row.expiration_date ?? null,
      }));

    return Response.json({
      stats: {
        totalEmployees: employeeCounts.active,
        fullyCompliant: summary.status_counts.current,
        expiringSoon: summary.status_counts.expiring_soon,
        expired: summary.status_counts.expired,
        needed: summary.status_counts.needed,
        upcomingSessions: sessions?.length ?? 0,
        criticalExpiring: summary.tier_counts.due_30,
      },
      urgentIssues: urgent,
      upcoming,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
