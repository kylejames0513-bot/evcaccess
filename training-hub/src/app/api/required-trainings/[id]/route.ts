import {
  getRequiredTrainingById,
  updateRequiredTraining,
  deleteRequiredTraining,
} from "@/lib/db/requirements";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import type { NextRequest } from "next/server";

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new ApiError("Invalid id — must be a number", 400, "invalid_field");
  }
  return n;
}

export const GET = withApiHandler(async (_req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const row = await getRequiredTrainingById(parseId(params.id));
  if (!row) throw new ApiError("Required training not found", 404, "not_found");
  return { required_training: row };
});

export const PATCH = withApiHandler(async (req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const patch = await req.json();
  const updated = await updateRequiredTraining(parseId(params.id), patch);
  return { required_training: updated };
});

export const DELETE = withApiHandler(async (_req: NextRequest, ctx) => {
  const params = await ctx!.params;
  await deleteRequiredTraining(parseId(params.id));
  return { ok: true };
});
