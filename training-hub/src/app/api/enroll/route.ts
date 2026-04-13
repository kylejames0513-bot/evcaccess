import { addEnrollees } from "@/lib/training-data";
import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { sessionId, names, action, force } = body as {
    sessionId?: string;
    names?: string[];
    action?: string;
    force?: boolean;
  };

  if (!sessionId) {
    throw new ApiError("sessionId is required", 400, "missing_field");
  }

  // Remove all enrollees from a session
  if (action === "remove_all") {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("enrollments")
      .delete()
      .eq("session_id", sessionId);
    if (error) throw error;
    return { success: true, removed: true };
  }

  if (!names || !Array.isArray(names) || names.length === 0) {
    throw new ApiError("Missing required fields: names (array)", 400, "missing_field");
  }

  const result = await addEnrollees(sessionId, names, { force: force === true });
  if (!result.success) {
    throw new ApiError(result.message, 400, "bad_request");
  }
  return result;
});
