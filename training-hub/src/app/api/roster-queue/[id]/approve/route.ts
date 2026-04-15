import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import {
  getPendingRosterEventById,
  updatePendingRosterEvent,
} from "@/lib/db/pending-roster";
import {
  parseNewHireSyncPayload,
  processNewHireSyncBatch,
} from "@/lib/sync/process-new-hires-sync";
import {
  parseSeparationSyncPayload,
  processSeparationSyncBatch,
} from "@/lib/sync/process-separations-sync";

export const POST = withApiHandler(async (_req, ctx) => {
  await requireHrCookie();
  const id = (await ctx?.params)?.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");

  const row = await getPendingRosterEventById(id);
  if (!row) throw new ApiError("not found", 404, "not_found");
  if (row.status !== "pending") {
    throw new ApiError("only pending events can be approved", 400, "conflict");
  }

  try {
    if (row.kind === "new_hires_batch") {
      const payload = row.payload as { new_hires?: unknown[] };
      const inputs = parseNewHireSyncPayload({ new_hires: payload.new_hires });
      const out = await processNewHireSyncBatch(inputs);
      await updatePendingRosterEvent(id, { status: "approved" });
      return { ok: true, applied: "new_hires_batch", ...out };
    }
    if (row.kind === "separations_batch") {
      const payload = row.payload as { separations?: unknown[] };
      const inputs = parseSeparationSyncPayload({ separations: payload.separations });
      const out = await processSeparationSyncBatch(inputs);
      await updatePendingRosterEvent(id, { status: "approved" });
      return { ok: true, applied: "separations_batch", ...out };
    }
    throw new ApiError(`unknown kind: ${row.kind}`, 400, "invalid_field");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await updatePendingRosterEvent(id, {
      status: "failed",
      error_message: msg.slice(0, 4000),
    });
    throw e;
  }
});
