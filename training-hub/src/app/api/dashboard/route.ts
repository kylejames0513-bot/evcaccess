import { getComplianceSummary, listCompliance } from "@/lib/db/compliance";
import { getEmployeeCounts } from "@/lib/db/employees";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const db = createServerClient();

    const [summary, employeeCounts, scheduledResult] = await Promise.all([
      getComplianceSummary(),
      getEmployeeCounts(),
      db
        .from("training_sessions")
        .select(`
          id, session_date, start_time, location, capacity, status,
          training_types ( name ),
          enrollments ( id, employee_id )
        `)
        .eq("status", "scheduled")
        .order("session_date", { ascending: true }),
    ]);

    if (scheduledResult.error) throw scheduledResult.error;

    const upcoming = (scheduledResult.data ?? []).slice(0, 6).map((s: Record<string, unknown>) => {
      const tt = s.training_types as { name: string } | null;
      const enrollments = s.enrollments as Array<{ id: string }> | null;
      return {
        id: s.id,
        training: tt?.name ?? "Unknown",
        date: s.session_date as string,
        time: (s.start_time as string) ?? "",
        location: (s.location as string) ?? "",
        enrolledCount: enrollments?.length ?? 0,
        capacity: s.capacity as number,
      };
    });

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
        upcomingSessions: scheduledResult.data?.length ?? 0,
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
