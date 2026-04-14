import { resolveUnknownTraining } from "@/lib/db/resolution";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import type { NextRequest } from "next/server";

/**
 * POST /api/review/trainings/[id]
 * Body: { resolved_to_training_type_id: number, resolved_by?: string }
 *
 * Resolving an unknown training also persists a new training_aliases
 * row pointing raw_name at the chosen training_type, so future imports
 * pick it up automatically. See db/resolution.ts.
 */
export const POST = withApiHandler(async (req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const body = (await req.json()) as {
    resolved_to_training_type_id?: number;
    resolved_by?: string;
  };
  if (!body.resolved_to_training_type_id) {
    throw new ApiError(
      "resolved_to_training_type_id is required",
      400,
      "missing_field"
    );
  }
  const updated = await resolveUnknownTraining(
    params.id,
    body.resolved_to_training_type_id,
    body.resolved_by
  );
  return { unknown_training: updated };
});
