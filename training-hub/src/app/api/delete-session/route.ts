import { deleteSession } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { sessionId } = body;

  if (!sessionId) {
    throw new ApiError("Missing required field: sessionId", 400, "missing_field");
  }

  const result = await deleteSession(sessionId);
  if (!result.success) {
    throw new ApiError(result.message, 400, "bad_request");
  }
  return result;
});
