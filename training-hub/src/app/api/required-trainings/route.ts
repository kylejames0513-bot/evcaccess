import {
  listRequiredTrainings,
  insertRequiredTraining,
} from "@/lib/db/requirements";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/required-trainings
 * Returns every rule, ordered universal -> dept -> position.
 */
export const GET = withApiHandler(async () => {
  const rows = await listRequiredTrainings();
  return { required_trainings: rows };
});

/**
 * POST /api/required-trainings
 * Body: { training_type_id: number, department?: string, position?: string,
 *         is_required?: boolean, is_universal?: boolean, notes?: string }
 */
export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  if (typeof body?.training_type_id !== "number") {
    throw new ApiError("training_type_id is required and must be a number", 400, "missing_field");
  }
  if (body.is_universal === false && !body.department && !body.position) {
    throw new ApiError(
      "A non-universal rule must specify at least a department or position",
      400,
      "invalid_field"
    );
  }
  const inserted = await insertRequiredTraining(body);
  return { required_training: inserted };
});
