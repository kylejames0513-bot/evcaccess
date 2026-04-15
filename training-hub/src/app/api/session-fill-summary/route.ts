import { withApiHandler, ApiError } from "@/lib/api-handler";
import { getSessionFillSummary } from "@/lib/db/session-fill-summary";

export const GET = withApiHandler(async (req) => {
  const raw = req.nextUrl.searchParams.get("horizon");
  const parsed = raw != null ? parseInt(raw, 10) : 60;
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 120) {
    throw new ApiError("horizon must be between 1 and 120", 400, "invalid_field");
  }
  return await getSessionFillSummary(parsed);
});
