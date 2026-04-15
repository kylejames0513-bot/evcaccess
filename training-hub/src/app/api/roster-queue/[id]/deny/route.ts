import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { getPendingRosterEventById, updatePendingRosterEvent } from "@/lib/db/pending-roster";

export const POST = withApiHandler(async (req, ctx) => {
  await requireHrCookie();
  const id = (await ctx?.params)?.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");

  const row = await getPendingRosterEventById(id);
  if (!row) throw new ApiError("not found", 404, "not_found");
  if (row.status !== "pending") {
    throw new ApiError("only pending events can be denied", 400, "conflict");
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : null;

  await updatePendingRosterEvent(id, {
    status: "denied",
    resolution_note: reason ?? "Denied from roster queue",
  });

  return { ok: true };
});
