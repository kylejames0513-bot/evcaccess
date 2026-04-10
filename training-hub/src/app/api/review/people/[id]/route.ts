import {
  getUnresolvedPerson,
  resolveUnresolvedPerson,
  backfillTrainingRecord,
} from "@/lib/db/resolution";
import { addEmployeeAlias } from "@/lib/db/employees";
import type { NextRequest } from "next/server";

/**
 * POST /api/review/people/[id]
 * Body: { resolved_to_employee_id: string, resolved_by?: string }
 *
 * Resolves the unresolved_people row AND backfills the training_record
 * that was missed during the original import. Also adds the original
 * full_name as an employee alias so future imports match automatically.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      resolved_to_employee_id: string;
      resolved_by?: string;
    };
    if (!body.resolved_to_employee_id) {
      return Response.json(
        { error: "resolved_to_employee_id is required" },
        { status: 400 }
      );
    }

    // Fetch the row before resolving so we have raw_payload for backfill.
    const row = await getUnresolvedPerson(id);
    if (!row) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // 1. Mark resolved.
    const updated = await resolveUnresolvedPerson(
      id,
      body.resolved_to_employee_id,
      body.resolved_by
    );

    // 2. Backfill the training record from raw_payload.
    let backfilledRecordId: string | null = null;
    try {
      backfilledRecordId = await backfillTrainingRecord(row, body.resolved_to_employee_id);
    } catch {
      // Non-fatal: the resolution itself succeeded. Log but don't fail.
    }

    // 3. Add the original full_name as an alias so future imports match.
    if (row.full_name) {
      try {
        await addEmployeeAlias(body.resolved_to_employee_id, row.full_name);
      } catch {
        // Non-fatal: alias may already exist or RPC may not be set up.
      }
    }

    return Response.json({
      unresolved_person: updated,
      backfilled_record_id: backfilledRecordId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
