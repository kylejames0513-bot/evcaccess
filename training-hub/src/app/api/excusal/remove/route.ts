import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * POST /api/excusal/remove
 * Body: { employee_id: string, training_type_id: number }
 *
 * Deletes the excusal for a specific employee + training.
 */
export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { employee_id, training_type_id } = body;

  if (!employee_id || !training_type_id) {
    throw new ApiError(
      "employee_id and training_type_id are required",
      400,
      "missing_field"
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("excusals")
    .delete()
    .eq("employee_id", employee_id)
    .eq("training_type_id", training_type_id);

  if (error) {
    throw new ApiError(`failed to delete excusal: ${error.message}`, 500, "internal");
  }
  return { ok: true };
});
