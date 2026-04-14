// ============================================================
// PATCH /api/employees/[id]/status — toggle an employee's active
// status. Used by the employee detail page to mark someone as no
// longer employed (is_active = false) or to reactivate them.
// ============================================================
// Body: { is_active: boolean }
//
// When flipping to false:
//   - Delegates to terminateEmployee() which also stamps terminated_at.
// When flipping to true:
//   - Clears terminated_at and sets is_active=true directly (this is
//     the simple "I hit the wrong button" undo path; a true rehire with
//     a new Paylocity ID should go through reactivateEmployee() instead).
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import {
  getEmployeeById,
  terminateEmployee,
  updateEmployee,
} from "@/lib/db/employees";

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = await ctx!.params;
  const id = params.id;
  if (!id) {
    throw new ApiError("employee id is required", 400, "missing_field");
  }

  const body = (await req.json().catch(() => ({}))) as {
    is_active?: unknown;
  };

  if (typeof body.is_active !== "boolean") {
    throw new ApiError("is_active must be a boolean", 400, "invalid_field");
  }

  const current = await getEmployeeById(id);
  if (!current) {
    throw new ApiError(`no employee with id ${id}`, 404, "not_found");
  }

  const employee = body.is_active
    ? await updateEmployee(id, { is_active: true, terminated_at: null })
    : await terminateEmployee(id);

  return { employee };
});
