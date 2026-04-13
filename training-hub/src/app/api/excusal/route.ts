import { setExcusal } from "@/lib/training-data";
import { listAllExcusalsWithDetails } from "@/lib/db/excusals";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/excusal
 *
 * Returns every excusal in the table joined to the employee + training
 * fields needed to display it. Consumed by the Required Trainings page's
 * "Excusals" tab so HR can actually see what they've created.
 */
export const GET = withApiHandler(async () => {
  const excusals = await listAllExcusalsWithDetails();
  return { excusals };
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { employeeName, trainingColumnKey, excused, reason } = body;

  if (!employeeName || !trainingColumnKey || typeof excused !== "boolean") {
    throw new ApiError(
      "Missing required fields: employeeName, trainingColumnKey, excused (boolean)",
      400,
      "missing_field"
    );
  }

  const result = await setExcusal(employeeName, trainingColumnKey, excused, reason);
  if (!result.success) {
    throw new ApiError(result.message, 400, "bad_request");
  }
  return result;
});
