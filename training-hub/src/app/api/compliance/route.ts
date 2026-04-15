import {
  listCompliance,
  getComplianceSummary,
  fixSharedColumnKeyCompliance,
  complianceRowsToCsvText,
  type ComplianceDueWindow,
} from "@/lib/db/compliance";
import { classifyTier } from "@/lib/notifications/tiers";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/compliance
 *
 * Query params:
 *   department, position, status, training_type_id, employee_id
 *   due_window=overdue|14|30|60|90 — `14` = expiration in the next 14 calendar days (not overdue); others match view ladder
 *   format=csv — same filters; returns text/csv with columns matching `complianceRowToCsv`.
 *
 * Returns (JSON default):
 *   {
 *     rows:    EmployeeCompliance[]
 *     summary: ComplianceSummary
 *   }
 *
 * Reads from the employee_compliance view (active employees only) so
 * the dashboard always sees the live join into required_trainings.
 */
export const GET = withApiHandler(async (req) => {
  const params = req.nextUrl.searchParams;
  const dw = params.get("due_window");
  const dueWindow: ComplianceDueWindow | undefined =
    dw === "overdue" || dw === "14" || dw === "30" || dw === "60" || dw === "90" ? dw : undefined;

  const filters = {
    department: params.get("department") ?? undefined,
    position: params.get("position") ?? undefined,
    status: (params.get("status") as never) ?? undefined,
    trainingTypeId: params.get("training_type_id")
      ? parseInt(params.get("training_type_id") ?? "", 10) || undefined
      : undefined,
    employeeId: params.get("employee_id") ?? undefined,
    dueWindow,
  };

  if (params.get("format") === "csv") {
    const rawRows = await listCompliance(filters);
    const rows = await fixSharedColumnKeyCompliance(rawRows);
    const body = complianceRowsToCsvText(rows);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="compliance_${date}.csv"`,
      },
    });
  }

  const [rawRows, summary] = await Promise.all([
    listCompliance(filters),
    getComplianceSummary(),
  ]);

  // Fix shared column_key types (e.g. Initial Med vs Med Recert)
  const rows = await fixSharedColumnKeyCompliance(rawRows);

  // Decorate with the JS tier function so the UI gets the same overdue
  // counter the SQL view exposes plus the friendly tier label.
  const today = new Date();
  const decorated = rows.map((row) => ({
    ...row,
    tier: classifyTier(row.expiration_date, today),
  }));

  return { rows: decorated, summary };
});
