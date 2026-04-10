import { getComplianceSummary, listCompliance } from "@/lib/db/compliance";
import { getEmployeeCounts } from "@/lib/db/employees";

/**
 * GET /api/dashboard
 *
 * Top-of-page summary for the root dashboard. Pulls from the new
 * employee_compliance view + employee count aggregates.
 *
 * Returns:
 *   {
 *     stats: { totalEmployees, totalActive, totalInactive, statusCounts, tierCounts, employeesWithAnyIssue }
 *     urgentIssues: top 8 expired/expiring_soon rows from the compliance view
 *   }
 */
export async function GET() {
  try {
    const [summary, employeeCounts] = await Promise.all([
      getComplianceSummary(),
      getEmployeeCounts(),
    ]);

    // Pull urgent issues directly from the compliance view, ordered by
    // expiration_date asc so the closest deadlines surface first.
    const expiredRows = await listCompliance({ status: "expired" });
    const expiringRows = await listCompliance({ status: "expiring_soon" });
    const urgent = [...expiredRows, ...expiringRows]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "expired" ? -1 : 1;
        return (a.expiration_date ?? "").localeCompare(b.expiration_date ?? "");
      })
      .slice(0, 8)
      .map((row) => ({
        employee_id: row.employee_id,
        first_name: row.first_name,
        last_name: row.last_name,
        department: row.department,
        training_name: row.training_name,
        status: row.status,
        completion_date: row.completion_date,
        expiration_date: row.expiration_date,
        days_overdue: row.days_overdue,
      }));

    return Response.json({
      stats: {
        total_employees: employeeCounts.active + employeeCounts.inactive,
        total_active: employeeCounts.active,
        total_inactive: employeeCounts.inactive,
        status_counts: summary.status_counts,
        tier_counts: summary.tier_counts,
        employees_with_any_issue: summary.employees_with_any_issue,
      },
      urgent_issues: urgent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
