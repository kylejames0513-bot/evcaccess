import { clearCompletionByColumnKey } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";

// POST /api/clear-completion
// Body: { employeeName, trainingColumnKey, reason }
// Wipes every training_records row for the employee + column_key
// (covers both Initial/Recert halves of a pair) and drops a
// training_note audit breadcrumb with the supplied reason.
export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { employeeName, trainingColumnKey, reason } = body as {
    employeeName?: string;
    trainingColumnKey?: string;
    reason?: string;
  };

  if (!employeeName || !trainingColumnKey) {
    throw new ApiError(
      "Missing required fields: employeeName, trainingColumnKey",
      400,
      "missing_field"
    );
  }
  if (!reason || !reason.trim()) {
    throw new ApiError("A reason is required to clear a completion", 400, "missing_field");
  }

  const result = await clearCompletionByColumnKey(
    employeeName,
    trainingColumnKey,
    reason
  );
  if (!result.success) {
    throw new ApiError(result.message, 400, "bad_request");
  }
  return { message: result.message, deleted: result.deleted };
});
