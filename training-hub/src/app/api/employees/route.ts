import { listEmployees } from "@/lib/db/employees";
import { listCompliance } from "@/lib/db/compliance";
import type { NextRequest } from "next/server";

/**
 * GET /api/employees
 *
 * Query params:
 *   active=true|false (default: true, set "all" to include both)
 *   department, position
 *
 * Returns one row per employee with their aggregate compliance status
 * (rolled up from employee_compliance view rows).
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const activeParam = params.get("active");
    const includeInactive = activeParam === "all" || activeParam === "false";
    const department = params.get("department") ?? undefined;
    const position = params.get("position") ?? undefined;

    const employees = await listEmployees({
      activeOnly: !includeInactive,
      department,
      position,
    });

    // For each employee, count their statuses from the compliance view.
    // One read per page is fine for HR dashboards. If this becomes a hot
    // path, fold it into a server-side aggregate.
    const compliance = await listCompliance();
    const byEmployee = new Map<string, { current: number; expired: number; expiring: number; needed: number; excused: number }>();
    for (const row of compliance) {
      if (!row.employee_id) continue;
      const e = byEmployee.get(row.employee_id) ?? { current: 0, expired: 0, expiring: 0, needed: 0, excused: 0 };
      if (row.status === "current") e.current += 1;
      else if (row.status === "expired") e.expired += 1;
      else if (row.status === "expiring_soon") e.expiring += 1;
      else if (row.status === "needed") e.needed += 1;
      else if (row.status === "excused") e.excused += 1;
      byEmployee.set(row.employee_id, e);
    }

    const result = employees.map((emp) => {
      const counts = byEmployee.get(emp.id) ?? {
        current: 0,
        expired: 0,
        expiring: 0,
        needed: 0,
        excused: 0,
      };
      const total = counts.current + counts.expired + counts.expiring + counts.needed + counts.excused;
      let status: "expired" | "expiring_soon" | "needed" | "current" = "current";
      if (counts.expired > 0) status = "expired";
      else if (counts.expiring > 0) status = "expiring_soon";
      else if (counts.needed > 0) status = "needed";
      return {
        id: emp.id,
        last_name: emp.last_name,
        first_name: emp.first_name,
        paylocity_id: emp.paylocity_id,
        department: emp.department,
        position: emp.position,
        job_title: emp.job_title,
        is_active: emp.is_active,
        terminated_at: emp.terminated_at,
        counts,
        total_required: total,
        status,
      };
    });

    return Response.json({ employees: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
