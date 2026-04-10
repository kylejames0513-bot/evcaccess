import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/excusal/remove
 * Body: { employee_id: string, training_type_id: number }
 *
 * Deletes the excusal for a specific employee + training.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employee_id, training_type_id } = body;

    if (!employee_id || !training_type_id) {
      return Response.json(
        { error: "employee_id and training_type_id are required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from("excusals")
      .delete()
      .eq("employee_id", employee_id)
      .eq("training_type_id", training_type_id);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
