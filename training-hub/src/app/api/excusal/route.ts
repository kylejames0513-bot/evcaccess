import { setExcusal } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";

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
