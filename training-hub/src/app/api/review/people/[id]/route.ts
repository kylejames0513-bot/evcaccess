import {
  getUnresolvedPerson,
  resolveUnresolvedPerson,
  backfillTrainingRecord,
} from "@/lib/db/resolution";
import { addEmployeeAlias } from "@/lib/db/employees";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import type { NextRequest } from "next/server";

/**
 * POST /api/review/people/[id]
 * Body: { resolved_to_employee_id: string, resolved_by?: string }
 *
 * Resolves the unresolved_people row AND backfills the training_record
 * that was missed during the original import. Also adds the original
 * full_name as an employee alias so future imports match automatically.
 */
export const POST = withApiHandler(async (req: NextRequest, ctx) => {
  await requireHrCookie();
  const params = await ctx!.params;
  const body = (await req.json()) as {
    resolved_to_employee_id?: string;
    resolved_by?: string;
  };
  if (!body.resolved_to_employee_id) {
    throw new ApiError("resolved_to_employee_id is required", 400, "missing_field");
  }

  // Fetch the row before resolving so we have raw_payload for backfill.
  const row = await getUnresolvedPerson(params.id);
  if (!row) {
    throw new ApiError("unresolved_people row not found", 404, "not_found");
  }

  // 1. Mark resolved.
  const updated = await resolveUnresolvedPerson(
    params.id,
    body.resolved_to_employee_id,
    body.resolved_by
  );

  // 2. Backfill the training record from raw_payload.
  let backfilledRecordId: string | null = null;
  try {
    backfilledRecordId = await backfillTrainingRecord(row, body.resolved_to_employee_id);
  } catch (err) {
    // Non-fatal: the resolution itself succeeded. Log and continue.
    console.warn("[review/people] backfill failed:", err);
  }

  // 3. Add the original full_name as an alias so future imports match.
  if (row.full_name) {
    try {
      await addEmployeeAlias(body.resolved_to_employee_id, row.full_name);
    } catch (err) {
      console.warn("[review/people] addEmployeeAlias failed:", err);
    }
  }

  return {
    unresolved_person: updated,
    backfilled_record_id: backfilledRecordId,
  };
});
