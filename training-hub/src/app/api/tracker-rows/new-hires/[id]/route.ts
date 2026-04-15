import type { NextRequest } from "next/server";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { deleteNewHireTrackerRow, updateNewHireTrackerRow } from "@/lib/db/trackers";
import type { NewHireTrackerRowUpdate } from "@/types/database";

export const PATCH = withApiHandler(async (req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const id = params.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");
  const patch = (await req.json()) as NewHireTrackerRowUpdate;
  const row = await updateNewHireTrackerRow(id, patch);
  return { row };
});

export const DELETE = withApiHandler(async (_req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const id = params.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");
  await deleteNewHireTrackerRow(id);
  return { ok: true };
});
