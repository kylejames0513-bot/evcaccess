import { getComplianceSummary, listCompliance } from "@/lib/db/compliance";
import { getEmployeeCounts } from "@/lib/db/employees";

/**
 * GET /api/dashboard
 *
 * Returns the shape the existing root page.tsx expects so the dashboard
 * keeps working without a full page rewrite.
 */
export async function GET() {
  try {
    const [summary, employeeCounts] = await Promise.all([
      getComplianceSummary(),
      getEmployeeCounts(),
    ]);

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
        upcomingSessions: 0,
        criticalExpiring: summary.tier_counts.due_30,
      },
      urgentIssues: urgent,
      upcoming: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
