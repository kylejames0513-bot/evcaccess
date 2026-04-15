import type { NextRequest } from "next/server";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { deleteSeparationTrackerRow, updateSeparationTrackerRow } from "@/lib/db/trackers";
import type { SeparationTrackerRowUpdate } from "@/types/database";
import { requireHrCookie } from "@/lib/auth/hr-session";

export const PATCH = withApiHandler(async (req: NextRequest, ctx) => {
  await requireHrCookie();
  const params = await ctx!.params;
  const id = params.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");
  const patch = (await req.json()) as SeparationTrackerRowUpdate;
  const row = await updateSeparationTrackerRow(id, patch);
  return { row };
});

export const DELETE = withApiHandler(async (_req: NextRequest, ctx) => {
  await requireHrCookie();
  const params = await ctx!.params;
  const id = params.id;
  if (!id) throw new ApiError("missing id", 400, "missing_field");
  await deleteSeparationTrackerRow(id);
  return { ok: true };
});
