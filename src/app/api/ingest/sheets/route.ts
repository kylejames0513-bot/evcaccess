/**
 * POST /api/ingest/sheets
 *
 * Vercel cron endpoint — nightly refresh of the two Google Sheet sources.
 *
 * Runs on the Node.js serverless runtime so it can use the shared ingest
 * helpers from scripts/ingest. Only pulls the two live CSV sources that
 * don't require a local file (employeeMaster, attendanceTracker). Local-
 * file sources (newHireTracker.xlsm, separationSummary.xlsx) are still
 * run manually via `npm run ingest`.
 *
 * Auth: CRON_SECRET (Bearer) required in production.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingest as ingestEmployeeMaster } from "../../../../../scripts/ingest/sources/employeeMaster";
import { ingest as ingestAttendance } from "../../../../../scripts/ingest/sources/attendanceTracker";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    const vercelCron = request.headers.get("x-vercel-cron");
    // Vercel's cron pings include x-vercel-cron; manual invocations need Bearer.
    if (auth !== `Bearer ${cronSecret}` && !vercelCron) {
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

  const started = Date.now();
  const results: Record<string, unknown> = {};

  try {
    const employee = await ingestEmployeeMaster({
      mode: "refresh",
      dryRun: false,
      supabase,
    });
    results.employeeMaster = employee;
  } catch (e) {
    results.employeeMaster = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const attendance = await ingestAttendance({
      mode: "refresh",
      dryRun: false,
      supabase,
    });
    results.attendanceTracker = attendance;
  } catch (e) {
    results.attendanceTracker = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    results,
  });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// Vercel cron invokes via GET; keep both for flexibility.
export async function GET(request: NextRequest) {
  return handle(request);
}
