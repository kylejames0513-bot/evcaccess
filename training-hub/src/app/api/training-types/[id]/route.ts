import {
  getTrainingTypeById,
  updateTrainingType,
  addTrainingAlias,
  listTrainingAliases,
} from "@/lib/db/trainings";
import { createServerClient } from "@/lib/supabase";
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
  const tt = await getTrainingTypeById(parseId(params.id));
  if (!tt) throw new ApiError("Training type not found", 404, "not_found");
  const aliases = await listTrainingAliases(tt.id);
  return { training_type: tt, aliases };
});

/**
 * PATCH /api/training-types/[id]
 * Body: { name?, column_key?, renewal_years?, is_required?, class_capacity?, is_active? }
 */
export const PATCH = withApiHandler(async (req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const body = await req.json();
  const updated = await updateTrainingType(parseId(params.id), body);
  return { training_type: updated };
});

/**
 * POST /api/training-types/[id]
 * Body: { action: 'add_alias', alias: string }
 *     | { action: 'remove_alias', alias_id: number }
 */
export const POST = withApiHandler(async (req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const id = parseId(params.id);
  const body = await req.json();

  if (body.action === "add_alias") {
    if (!body.alias) throw new ApiError("alias is required", 400, "missing_field");
    const result = await addTrainingAlias(id, body.alias, body.source ?? "manual");
    return { alias: result };
  }

  if (body.action === "remove_alias") {
    if (!body.alias_id) throw new ApiError("alias_id is required", 400, "missing_field");
    const { error } = await createServerClient()
      .from("training_aliases")
      .delete()
      .eq("id", body.alias_id);
    if (error) throw error;
    return { ok: true };
  }

  throw new ApiError(`Unknown action: ${body.action}`, 400, "invalid_field");
});
