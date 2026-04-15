// ============================================================
// POST /api/settings/separation-sync — HR-authenticated workbook
// sync trigger from the compact Settings upload panel.
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { insertPendingRosterEvent } from "@/lib/db/pending-roster";
import { isRosterSyncGated } from "@/lib/sync/roster-sync-mode";
import {
  parseSeparationSyncPayload,
  processSeparationSyncBatch,
} from "@/lib/sync/process-separations-sync";

const MAX_SEPARATIONS_PER_UPLOAD = 10_000;

export const POST = withApiHandler(async (req) => {
  await requireHrCookie();

  const body = await req.json().catch(() => ({}));
  const inputs = parseSeparationSyncPayload(body);
  if (inputs.length > MAX_SEPARATIONS_PER_UPLOAD) {
    throw new ApiError(
      `separations payload is too large (${inputs.length}). Max allowed is ${MAX_SEPARATIONS_PER_UPLOAD}.`,
      413,
      "payload_too_large"
    );
  }

  if (isRosterSyncGated()) {
    const { id } = await insertPendingRosterEvent({
      kind: "separations_batch",
      payload: { separations: inputs } as never,
    });
    return new Response(
      JSON.stringify({
        queued: true,
        pending_id: id,
        row_count: inputs.length,
        message:
          "Roster sync is gated: workbook batch is queued for HR approval on /roster-queue. Employees were not updated yet.",
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return await processSeparationSyncBatch(inputs);
});
