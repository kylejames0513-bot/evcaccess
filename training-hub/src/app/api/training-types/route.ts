import { listTrainingTypes, insertTrainingType } from "@/lib/db/trainings";
import { listTrainingAliases } from "@/lib/db/trainings";
import type { NextRequest } from "next/server";

/**
 * GET /api/training-types
 * Returns all training types with their aliases.
 */
export async function GET() {
  try {
    const [types, aliases] = await Promise.all([
      listTrainingTypes(),
      listTrainingAliases(),
    ]);
    // Attach aliases to each type
    const aliasesByType = new Map<number, string[]>();
    for (const a of aliases) {
      const list = aliasesByType.get(a.training_type_id) ?? [];
      list.push(a.alias);
      aliasesByType.set(a.training_type_id, list);
    }
    const enriched = types.map((t) => ({
      ...t,
      aliases: aliasesByType.get(t.id) ?? [],
    }));
    return Response.json({ training_types: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/training-types
 * Body: { name, column_key, renewal_years?, is_required?, class_capacity?, is_active? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.column_key) {
      return Response.json({ error: "name and column_key are required" }, { status: 400 });
    }
    const inserted = await insertTrainingType({
      name: body.name,
      column_key: body.column_key,
      renewal_years: body.renewal_years ?? 0,
      is_required: body.is_required ?? false,
      class_capacity: body.class_capacity ?? 15,
      is_active: body.is_active ?? true,
    });
    return Response.json({ training_type: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
