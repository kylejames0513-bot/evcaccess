import { removeEnrollee } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { sessionId, name, terminate } = body;

  if (!sessionId || !name) {
    throw new ApiError("Missing required fields: sessionId, name", 400, "missing_field");
  }

  const result = await removeEnrollee(sessionId, name, {
    terminate: terminate === true,
  });
  if (!result.success) {
    throw new ApiError(result.message, 400, "bad_request");
  }
  return result;
});
