/**
 * POST /api/ingest/sheets
 *
 * Vercel cron endpoint — pulls Sources A (Merged Employee Master) and
 * B (Attendance Tracker) from their Google Sheets published CSVs and
 * upserts into Supabase. Runs nightly per vercel.json.
 *
 * Sources C (New Hire Tracker .xlsm) and D (FY Separation Summary .xlsx)
 * still require the CLI (`npm run ingest:seed`) because they read local
 * files from disk.
 *
 * Auth: CRON_SECRET header required when the env var is set.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as employeeMaster from "../../../../../scripts/ingest/sources/employeeMaster";
import * as attendanceTracker from "../../../../../scripts/ingest/sources/attendanceTracker";

export const runtime = "nodejs";
export const maxDuration = 300;

async function runIngest(request: NextRequest) {
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

  const startedAt = new Date().toISOString();
  const empStats = await employeeMaster.ingest({ mode: "refresh", dryRun: false, supabase });
  const attStats = await attendanceTracker.ingest({ mode: "refresh", dryRun: false, supabase });

  const hasErrors = empStats.errors.length + attStats.errors.length > 0;

  return NextResponse.json(
    {
      ok: !hasErrors,
      startedAt,
      finishedAt: new Date().toISOString(),
      employeeMaster: empStats,
      attendanceTracker: attStats,
    },
    { status: hasErrors ? 500 : 200 }
  );
}

export async function POST(request: NextRequest) {
  return runIngest(request);
}

// Vercel cron invokes with GET by default.
export async function GET(request: NextRequest) {
  return runIngest(request);
}
