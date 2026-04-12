import { getTrainingTypeById } from "@/lib/db/trainings";
import { getHistoryForTraining } from "@/lib/db/history";
import { listCompliance } from "@/lib/db/compliance";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/training-detail?id=<training_type_id>
 *
 * Returns the training type plus the full per-training audit trail and
 * the active-employee compliance roster (who has it, who's expired,
 * who's missing).
 */
export const GET = withApiHandler(async (req) => {
  const idParam = req.nextUrl.searchParams.get("id");
  if (!idParam) {
    throw new ApiError("Missing query param: id", 400, "missing_field");
  }
  const id = parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    throw new ApiError("id must be a number", 400, "invalid_field");
  }
  const training = await getTrainingTypeById(id);
  if (!training) {
    throw new ApiError("Not found", 404, "not_found");
  }
  const [history, compliance] = await Promise.all([
    getHistoryForTraining(id),
    listCompliance({ trainingTypeId: id }),
  ]);
  return { training, history, compliance };
});
