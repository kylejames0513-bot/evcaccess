import { addEnrollees } from "@/lib/training-data";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, names, action } = body;

    if (!sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Remove all enrollees from a session
    if (action === "remove_all") {
      const supabase = createServerClient();
      const { error } = await supabase
        .from("enrollments")
        .delete()
        .eq("session_id", sessionId);
      if (error) throw error;
      return Response.json({ success: true, removed: true });
    }

    if (!names || !Array.isArray(names) || names.length === 0) {
      return Response.json(
        { error: "Missing required fields: names (array)" },
        { status: 400 }
      );
    }

    const result = await addEnrollees(sessionId, names);
    if (!result.success) {
      return Response.json({ error: result.message }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
