// ============================================================
// POST /api/sync/new-hires — batch push from the Monthly New Hire
// Tracker workbook. See docs/sync-contract.md.
// ============================================================

import { withApiHandler } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import { insertPendingRosterEvent } from "@/lib/db/pending-roster";
import { isRosterSyncGated } from "@/lib/sync/roster-sync-mode";
import {
  parseNewHireSyncPayload,
  processNewHireSyncBatch,
} from "@/lib/sync/process-new-hires-sync";

export const POST = withApiHandler(async (req) => {
  requireSyncToken(req);

  const body = await req.json().catch(() => ({}));
  const inputs = parseNewHireSyncPayload(body);

  if (isRosterSyncGated()) {
    const { id } = await insertPendingRosterEvent({
      kind: "new_hires_batch",
      payload: { new_hires: inputs } as never,
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

  return await processNewHireSyncBatch(inputs);
});
