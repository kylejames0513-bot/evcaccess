import { recordCompletion } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";

export const POST = withApiHandler(async (request) => {
  await requireHrCookie();
  const body = await request.json();
  const { employeeName, trainingColumnKey, completionDate } = body;

  if (!employeeName || !trainingColumnKey || !completionDate) {
    throw new ApiError(
      "Missing required fields: employeeName, trainingColumnKey, completionDate",
      400,
      "missing_field"
    );
  }

  const dateStr = (completionDate as string).trim();

  const result = await recordCompletion(employeeName, trainingColumnKey, dateStr);

  if (!result.success) {
    throw new ApiError(result.message, 404, "not_found");
  }

  return { message: result.message };
});
