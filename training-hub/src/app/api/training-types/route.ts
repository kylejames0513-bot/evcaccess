import { listTrainingTypes, insertTrainingType, listTrainingAliases } from "@/lib/db/trainings";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/training-types
 * Returns all training types with their aliases.
 */
export const GET = withApiHandler(async () => {
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
  return { training_types: enriched };
});

/**
 * POST /api/training-types
 * Body: { name, column_key, renewal_years?, is_required?, class_capacity?, is_active? }
 */
export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  if (!body.name || !body.column_key) {
    throw new ApiError("name and column_key are required", 400, "missing_field");
  }
  const inserted = await insertTrainingType({
    name: body.name,
    column_key: body.column_key,
    renewal_years: body.renewal_years ?? 0,
    is_required: body.is_required ?? false,
    class_capacity: body.class_capacity ?? 15,
    is_active: body.is_active ?? true,
  });
  return { training_type: inserted };
});
