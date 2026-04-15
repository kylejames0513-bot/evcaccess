// ============================================================
// GET /api/sync/separation-audit — token-authenticated pull of recent
// separation tracker audit rows for Excel reconciliation.
// ============================================================

import { withApiHandler } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import { createServerClient } from "@/lib/supabase";

export const GET = withApiHandler(async (req) => {
  requireSyncToken(req);

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, Math.max(1, parseInt(limitRaw ?? "200", 10) || 200));

  const db = createServerClient();
  const { data, error } = await db
    .from("separation_tracker_rows")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return { rows: data ?? [] };
});
