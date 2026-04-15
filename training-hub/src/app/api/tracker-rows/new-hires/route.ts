import { withApiHandler, ApiError } from "@/lib/api-handler";
import {
  insertNewHireTrackerRow,
  listNewHireTrackerRows,
  updateNewHireTrackerRow,
} from "@/lib/db/trackers";
import type { NewHireTrackerRowInsert, NewHireTrackerRowUpdate } from "@/types/database";

export const GET = withApiHandler(async () => {
  const rows = await listNewHireTrackerRows();
  return { rows };
});

export const POST = withApiHandler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    row?: Partial<NewHireTrackerRowInsert>;
    patch?: NewHireTrackerRowUpdate;
  };
  if (body.action === "update") {
    if (!body.id || typeof body.id !== "string") {
      throw new ApiError("id required for update", 400, "missing_field");
    }
    if (!body.patch || typeof body.patch !== "object") {
      throw new ApiError("patch required for update", 400, "missing_field");
    }
    const updated = await updateNewHireTrackerRow(body.id, body.patch);
    return { row: updated };
  }
  const row = body.row as NewHireTrackerRowInsert | undefined;
  if (!row?.sheet || row.row_number == null || !row.last_name || !row.first_name || !row.hire_date) {
    throw new ApiError(
      "row.sheet, row_number, last_name, first_name, hire_date are required",
      400,
      "missing_field"
    );
  }
  const created = await insertNewHireTrackerRow(row);
  return { row: created };
});
