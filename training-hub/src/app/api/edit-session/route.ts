import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, training, date, time, location } = body;

    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Fetch existing session for fallback values
    const { data: existing, error: fetchError } = await supabase
      .from("training_sessions")
      .select("id, session_date, start_time, location, training_type_id, training_types(name)")
      .eq("id", sessionId)
      .maybeSingle();

    if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);
    if (!existing) return Response.json({ error: "Session not found" }, { status: 404 });

    const updates: Record<string, any> = {};
    if (date !== undefined) updates.session_date = date;
    if (time !== undefined) updates.start_time = time || null;
    if (location !== undefined) updates.location = location || null;

    if (training !== undefined) {
      const { data: tt } = await supabase
        .from("training_types")
        .select("id")
        .or(`name.ilike.${training},column_key.ilike.${training}`)
        .limit(1)
        .single();

      if (tt) {
        updates.training_type_id = tt.id;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("training_sessions")
        .update(updates)
        .eq("id", sessionId);

      if (updateError) throw new Error(`Failed to update session: ${updateError.message}`);
    }

    const newTraining = training || (existing as any).training_types?.name || "Unknown";
    const newDate = date || (existing as any).session_date;

    return Response.json({
      success: true,
      message: `Updated session: ${newTraining} on ${newDate}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
