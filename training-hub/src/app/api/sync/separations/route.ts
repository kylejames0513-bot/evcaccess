// ============================================================
// POST /api/sync/separations — batch push from FY Separation Summary.
// See docs/sync-contract.md.
// ============================================================

import { withApiHandler } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import { insertPendingRosterEvent } from "@/lib/db/pending-roster";
import { isRosterSyncGated } from "@/lib/sync/roster-sync-mode";
import {
  parseSeparationSyncPayload,
  processSeparationSyncBatch,
} from "@/lib/sync/process-separations-sync";

export const POST = withApiHandler(async (req) => {
  requireSyncToken(req);

  const body = await req.json().catch(() => ({}));
  const inputs = parseSeparationSyncPayload(body);

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
          "Roster sync is gated: batch is queued for HR approval on /roster-queue. Employees were not updated yet.",
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return await processSeparationSyncBatch(inputs);
});
