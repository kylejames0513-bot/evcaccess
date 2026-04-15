import { createSession } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";

export const POST = withApiHandler(async (request) => {
  await requireHrCookie();
  const body = await request.json();
  const { trainingType, date, time, location, enrollees } = body;

  if (!trainingType || !date) {
    throw new ApiError(
      "Missing required fields: trainingType, date",
      400,
      "missing_field"
    );
  }

  return await createSession(
    trainingType,
    date,
    time || "",
    location || "",
    enrollees || []
  );
});
