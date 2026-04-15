import type { NextRequest } from "next/server";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { getSeparationTrackerRowById } from "@/lib/db/trackers";
import { processSeparationSyncBatch } from "@/lib/sync/process-separations-sync";

export const POST = withApiHandler(async (_req: NextRequest, ctx) => {
  const params = await ctx?.params;
  const id = params?.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");

  const row = await getSeparationTrackerRowById(id);
  if (!row) throw new ApiError("not found", 404, "not_found");

  const result = await processSeparationSyncBatch([
    {
      last_name: row.last_name,
      first_name: row.first_name,
      date_of_separation: row.date_of_separation,
      sheet: row.fy_sheet,
      row_number: row.row_number,
    },
  ]);

  const refreshed = await getSeparationTrackerRowById(id);

  return {
    ok: true,
    result: result.results[0] ?? null,
    summary: result.summary,
    row: refreshed ?? row,
  };
});
