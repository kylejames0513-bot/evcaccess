import {
  getTrainingTypeById,
  updateTrainingType,
  addTrainingAlias,
  listTrainingAliases,
} from "@/lib/db/trainings";
import { createServerClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tt = await getTrainingTypeById(parseInt(id, 10));
    if (!tt) return Response.json({ error: "Not found" }, { status: 404 });
    const aliases = await listTrainingAliases(tt.id);
    return Response.json({ training_type: tt, aliases });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/training-types/[id]
 * Body: { name?, column_key?, renewal_years?, is_required?, class_capacity?, is_active? }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await updateTrainingType(parseInt(id, 10), body);
    return Response.json({ training_type: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/training-types/[id]
 * Body: { action: 'add_alias', alias: string }
 *     | { action: 'remove_alias', alias_id: number }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    if (body.action === "add_alias") {
      if (!body.alias) return Response.json({ error: "alias is required" }, { status: 400 });
      const result = await addTrainingAlias(parseInt(id, 10), body.alias, body.source ?? "manual");
      return Response.json({ alias: result });
    }

    if (body.action === "remove_alias") {
      if (!body.alias_id) return Response.json({ error: "alias_id is required" }, { status: 400 });
      const { error } = await createServerClient()
        .from("training_aliases")
        .delete()
        .eq("id", body.alias_id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
