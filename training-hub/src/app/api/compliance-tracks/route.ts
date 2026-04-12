import { getComplianceTracks, setComplianceTracks } from "@/lib/hub-settings";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const tracks = await getComplianceTracks();
  return { tracks };
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { tracks } = body;
  if (!tracks || !Array.isArray(tracks)) {
    throw new ApiError("Missing tracks array", 400, "missing_field");
  }
  const result = await setComplianceTracks(tracks);
  return { tracks: result };
});
