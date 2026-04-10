import { resolveUnknownTraining } from "@/lib/db/resolution";
import type { NextRequest } from "next/server";

/**
 * POST /api/review/trainings/[id]
 * Body: { resolved_to_training_type_id: number, resolved_by?: string }
 *
 * Resolving an unknown training also persists a new training_aliases
 * row pointing raw_name at the chosen training_type, so future imports
 * pick it up automatically. See db/resolution.ts.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      resolved_to_training_type_id: number;
      resolved_by?: string;
    };
    if (!body.resolved_to_training_type_id) {
      return Response.json(
        { error: "resolved_to_training_type_id is required" },
        { status: 400 }
      );
    }
    const updated = await resolveUnknownTraining(
      id,
      body.resolved_to_training_type_id,
      body.resolved_by
    );
    return Response.json({ unknown_training: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
