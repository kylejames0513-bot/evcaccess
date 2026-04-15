import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { denyPendingRosterEvent, getPendingRosterEventById } from "@/lib/db/pending-roster";

export const POST = withApiHandler(async (req, ctx) => {
  await requireHrCookie();
  const id = (await ctx?.params)?.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : null;

  const denied = await denyPendingRosterEvent(id, reason);
  if (!denied) {
    const row = await getPendingRosterEventById(id);
    if (!row) throw new ApiError("not found", 404, "not_found");
    throw new ApiError(`event is already ${row.status}`, 409, "conflict");
  }

  return { ok: true };
});
