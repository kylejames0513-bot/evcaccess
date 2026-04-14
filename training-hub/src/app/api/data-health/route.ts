import { withApiHandler } from "@/lib/api-handler";
import { computeDataHealthSummary } from "@/lib/data-health-summary";

export const GET = withApiHandler(async () => {
  return computeDataHealthSummary();
});
