import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionRowIndex, training, date, time, location } = body;

    if (!sessionRowIndex) {
      return Response.json({ error: "Missing sessionRowIndex" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Find session by sorted index (same logic as training-data.ts findSessionByIndex)
    const { data: sessions, error: fetchError } = await supabase
      .from("training_sessions")
      .select("id, session_date, start_time, location, training_type_id, training_types(name)")
      .in("status", ["scheduled", "in_progress"])
      .order("session_date", { ascending: true });

    if (fetchError) throw new Error(`Failed to fetch sessions: ${fetchError.message}`);

    const idx = sessionRowIndex - 2;
    if (!sessions || idx < 0 || idx >= sessions.length) {
      return Response.json({ error: "Session row not found" }, { status: 400 });
    }

    const session = sessions[idx] as any;

    // Build update payload — keep existing values if not provided
    const updates: Record<string, any> = {};
    if (date !== undefined) updates.session_date = date;
    if (time !== undefined) updates.start_time = time || null;
    if (location !== undefined) updates.location = location || null;

    // If training name changed, find the new training type
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
        .eq("id", session.id);

      if (updateError) throw new Error(`Failed to update session: ${updateError.message}`);
    }

    const newTraining = training || session.training_types?.name || "Unknown";
    const newDate = date || session.session_date;

    return Response.json({
      success: true,
      message: `Updated session: ${newTraining} on ${newDate}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
