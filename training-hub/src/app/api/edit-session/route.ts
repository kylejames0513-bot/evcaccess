import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

type SessionUpdate = {
  session_date?: string;
  start_time?: string | null;
  location?: string | null;
  training_type_id?: number;
};

type ExistingSession = {
  id: string;
  session_date: string;
  start_time: string | null;
  location: string | null;
  training_type_id: number;
  training_types?: { name: string } | null;
};

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { sessionId, training, date, time, location } = body;

  if (!sessionId) {
    throw new ApiError("Missing sessionId", 400, "missing_field");
  }

  const supabase = createServerClient();

  // Fetch existing session for fallback values
  const { data: existing, error: fetchError } = await supabase
    .from("training_sessions")
    .select("id, session_date, start_time, location, training_type_id, training_types(name)")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);
  if (!existing) throw new ApiError("Session not found", 404, "not_found");
  const typedExisting = existing as unknown as ExistingSession;

  const updates: SessionUpdate = {};
  if (date !== undefined) updates.session_date = date;
  if (time !== undefined) updates.start_time = time || null;
  if (location !== undefined) updates.location = location || null;

  if (training !== undefined) {
    const safeTraining = String(training).replace(/[,%]/g, "");
    const { data: tt } = await supabase
      .from("training_types")
      .select("id")
      .or(`name.ilike.${safeTraining},column_key.ilike.${safeTraining}`)
      .limit(1)
      .maybeSingle();

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

  const newTraining = training || typedExisting.training_types?.name || "Unknown";
  const newDate = date || typedExisting.session_date;

  return {
    success: true,
    message: `Updated session: ${newTraining} on ${newDate}`,
  };
});
