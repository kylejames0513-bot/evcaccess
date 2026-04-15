import { withApiHandler } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { listPendingRosterEvents } from "@/lib/db/pending-roster";

export const GET = withApiHandler(async (req) => {
  await requireHrCookie();
  const scope = req.nextUrl.searchParams.get("scope") ?? "pending";
  const status = scope === "all" ? "all" : "pending";
  const rows = await listPendingRosterEvents(status);
  return { rows };
});
