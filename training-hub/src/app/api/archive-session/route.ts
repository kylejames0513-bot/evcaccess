// ============================================================
// POST /api/archive-session — mark a training session complete.
// ============================================================
// Called by the attendance page after an operator records
// present/absent for a session. Records training_records rows for
// attendees, updates enrollment statuses, and flips the session
// itself to 'completed'.
//
// This endpoint was referenced by src/app/attendance/page.tsx:170
// but the route file never existed, so archiving silently 404'd.
// The underlying archiveSession() helper in lib/training-data.ts
// has been in place; this just exposes it through the router.
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { archiveSession } from "@/lib/training-data";

export const POST = withApiHandler(async (req) => {
  await requireHrCookie();
  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown };

  if (typeof body.sessionId !== "string" || body.sessionId.length === 0) {
    throw new ApiError("sessionId is required", 400, "missing_field");
  }

  const result = await archiveSession(body.sessionId);
  if (!result.success) {
    throw new ApiError(result.message, 400, "unprocessable");
  }

  return { ok: true, message: result.message };
});
