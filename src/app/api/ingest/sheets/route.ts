/**
 * POST /api/ingest/sheets
 *
 * Vercel cron endpoint — placeholder for nightly Google Sheets sync.
 * The actual ingestion logic runs via CLI (npm run ingest:refresh)
 * because it depends on Node.js modules (crypto, fs) that aren't
 * available in the Next.js edge/serverless runtime.
 *
 * This route logs a cron trigger and returns status.
 * For v1, Kyle triggers manually. v2 will use a Vercel serverless function.
 *
 * Auth: CRON_SECRET header required in production.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase credentials" }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Log the cron trigger
  await supabase.from("ingestion_runs").insert({
    source: "cron_trigger",
    status: "success",
    triggered_by: "cron",
    rows_processed: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    rows_unresolved: 0,
    finished_at: new Date().toISOString(),
    error_summary: "Cron endpoint reached. Run `npm run ingest:refresh` for full sync.",
  });

  return NextResponse.json({
    ok: true,
    message: "Cron trigger logged. Use CLI for full ingestion: npm run ingest:refresh",
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
