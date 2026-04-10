import { listCompliance, getComplianceSummary } from "@/lib/db/compliance";
import { classifyTier } from "@/lib/notifications/tiers";
import type { NextRequest } from "next/server";

/**
 * GET /api/compliance
 *
 * Query params:
 *   department, position, status, training_type_id, employee_id
 *
 * Returns:
 *   {
 *     rows:    EmployeeCompliance[]
 *     summary: ComplianceSummary
 *   }
 *
 * Reads from the employee_compliance view (active employees only) so
 * the dashboard always sees the live join into required_trainings.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const filters = {
      department: params.get("department") ?? undefined,
      position: params.get("position") ?? undefined,
      status: (params.get("status") as never) ?? undefined,
      trainingTypeId: params.get("training_type_id")
        ? parseInt(params.get("training_type_id") ?? "", 10) || undefined
        : undefined,
      employeeId: params.get("employee_id") ?? undefined,
    };

    const [rows, summary] = await Promise.all([
      listCompliance(filters),
      getComplianceSummary(),
    ]);

    // Decorate with the JS tier function so the UI gets the same overdue
    // counter the SQL view exposes plus the friendly tier label.
    const today = new Date();
    const decorated = rows.map((row) => ({
      ...row,
      tier: classifyTier(row.expiration_date, today),
    }));

    return Response.json({ rows: decorated, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
