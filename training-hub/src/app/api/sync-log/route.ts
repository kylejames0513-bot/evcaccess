import { getSyncLog } from "@/lib/hub-settings";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const log = await getSyncLog();
  return { log };
});
