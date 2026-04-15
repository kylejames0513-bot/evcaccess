import { withApiHandler, ApiError } from "@/lib/api-handler";
import {
  insertSeparationTrackerRow,
  listSeparationTrackerRows,
  updateSeparationTrackerRow,
} from "@/lib/db/trackers";
import type { SeparationTrackerRowInsert, SeparationTrackerRowUpdate } from "@/types/database";

export const GET = withApiHandler(async () => {
  const rows = await listSeparationTrackerRows();
  return { rows };
});

export const POST = withApiHandler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    row?: Partial<SeparationTrackerRowInsert>;
    patch?: SeparationTrackerRowUpdate;
  };
  if (body.action === "update") {
    if (!body.id || typeof body.id !== "string") {
      throw new ApiError("id required for update", 400, "missing_field");
    }
    if (!body.patch || typeof body.patch !== "object") {
      throw new ApiError("patch required for update", 400, "missing_field");
    }
    const updated = await updateSeparationTrackerRow(body.id, body.patch);
    return { row: updated };
  }
  const row = body.row as SeparationTrackerRowInsert | undefined;
  if (
    !row?.fy_sheet ||
    row.row_number == null ||
    !row.last_name ||
    !row.first_name ||
    !row.date_of_separation
  ) {
    throw new ApiError(
      "row.fy_sheet, row_number, last_name, first_name, date_of_separation are required",
      400,
      "missing_field"
    );
  }
  const created = await insertSeparationTrackerRow(row);
  return { row: created };
});
