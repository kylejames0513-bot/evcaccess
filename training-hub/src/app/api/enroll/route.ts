import { addEnrollees } from "@/lib/training-data";
import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";

export const POST = withApiHandler(async (request) => {
  await requireHrCookie();
  const body = await request.json();
  const { sessionId, names, action, force, allowExcused } = body as {
    sessionId?: string;
    names?: string[];
    action?: string;
    force?: boolean;
    allowExcused?: boolean;
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
    if (error) {
      throw new ApiError(`failed to clear enrollments: ${error.message}`, 500, "internal");
    }
    return { success: true, removed: true };
  }

  if (!names || !Array.isArray(names) || names.length === 0) {
    throw new ApiError("Missing required fields: names (array)", 400, "missing_field");
  }

  const result = await addEnrollees(sessionId, names, {
    force: force === true,
    allowExcused: allowExcused === true,
  });

  // Excusal preflight hit — return a 409 with the blocked names so
  // the client can prompt "These people are excused, enroll anyway?"
  // and retry with allowExcused:true.
  if (!result.success && result.excusedBlocked && result.excusedBlocked.length > 0) {
    return Response.json(
      {
        error: result.message,
        code: "excused_block",
        excusedBlocked: result.excusedBlocked,
      },
      { status: 409 }
    );
  }

  if (!result.success) {
    throw new ApiError(result.message, 400, "bad_request");
  }
  return result;
});
