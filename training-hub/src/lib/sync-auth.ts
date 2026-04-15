// ============================================================
// Shared-token auth for the /api/sync/* endpoints.
// ============================================================
// These endpoints exist so the external VBA macros in the
// Monthly New Hire Tracker and FY Separation Summary workbooks
// can push/pull employee data without hitting Supabase PostgREST
// directly. Direct PostgREST calls stopped working after the
// RLS defense-in-depth migration (20260412120100) which removed
// all anon policies on employees / training_records / etc.
//
// Auth model:
//   - The macros send a shared secret in an `x-hub-sync-token`
//     header.
//   - The hub compares it against the HUB_SYNC_TOKEN env var.
//   - If it matches, the request is allowed and the handler uses
//     the service-role Supabase client (which bypasses RLS).
//   - If it doesn't, the handler returns 401 and leaks nothing.
//
// Rotating the token is a single Vercel env-var change plus a
// single string update at the top of each .bas file. The
// service-role key is never embedded in the workbook.
// ============================================================

import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api-handler";
import type { NextRequest } from "next/server";

const TOKEN_HEADER = "x-hub-sync-token";

/**
 * Throw ApiError(401) unless the request presents the correct
 * HUB_SYNC_TOKEN in the x-hub-sync-token header.
 *
 * Uses timing-safe comparison when lengths match.
 */
export function requireSyncToken(req: NextRequest): void {
  const expected = process.env.HUB_SYNC_TOKEN;
  if (!expected || expected.trim().length === 0) {
    // Misconfigured server: refuse rather than fail open.
    throw new ApiError(
      "sync endpoint is not configured (HUB_SYNC_TOKEN missing)",
      503,
      "internal"
    );
  }
  const presented = req.headers.get(TOKEN_HEADER) ?? "";
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    throw new ApiError("invalid or missing sync token", 401, "unauthorized");
  }
}
