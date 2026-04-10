import { getEmployeeById } from "@/lib/db/employees";
import { getHistoryForEmployee } from "@/lib/db/history";
import { getMasterCompletionsForEmployee } from "@/lib/db/completions";
import { listExcusalsForEmployee } from "@/lib/db/excusals";
import { listCompliance } from "@/lib/db/compliance";
import type { NextRequest } from "next/server";

/**
 * GET /api/employee-detail?id=<uuid>
 *
 * Returns the employee row, their full audit trail (employee_history),
 * the per-training winning completion (master_completions), their
 * excusals, and their compliance status (only populated if active —
 * employee_compliance excludes terminated employees by design).
 */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return Response.json({ error: "Missing query param: id" }, { status: 400 });
    }

    const employee = await getEmployeeById(id);
    if (!employee) {
      return Response.json({ error: `Employee ${id} not found` }, { status: 404 });
    }

    const [history, master, excusals, compliance] = await Promise.all([
      getHistoryForEmployee(id),
      getMasterCompletionsForEmployee(id),
      listExcusalsForEmployee(id),
      employee.is_active ? listCompliance({ employeeId: id }) : Promise.resolve([]),
    ]);

    return Response.json({
      employee,
      history,
      master_completions: master,
      excusals,
      compliance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
