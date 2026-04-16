/**
 * CLI entry point for HR Hub ingestion.
 *
 * Usage:
 *   npm run ingest:seed          # First-time load all sources
 *   npm run ingest:refresh       # Pull Google Sheets (Sources A+B)
 *   npm run ingest:source=attendance_tracker  # Single source
 *   npm run ingest:dry-run       # Print what would change
 *   npm run ingest:verify        # Diff without writing
 */

import * as path from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load env
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

import * as employeeMaster from "./sources/employeeMaster.js";
import * as attendanceTracker from "./sources/attendanceTracker.js";
import * as separationSummary from "./sources/separationSummary.js";

const SOURCES: Record<string, { ingest: typeof employeeMaster.ingest }> = {
  employee_master: employeeMaster,
  merged_master: employeeMaster,
  attendance_tracker: attendanceTracker,
  separation_xlsx: separationSummary,
  separation_summary: separationSummary,
};

function parseArgs() {
  const args = process.argv.slice(2);
  let mode: "seed" | "refresh" | "verify" = "refresh";
  let dryRun = false;
  let source: string | null = null;

  for (const arg of args) {
    if (arg === "--mode=seed" || arg === "seed") mode = "seed";
    if (arg === "--mode=refresh" || arg === "refresh") mode = "refresh";
    if (arg === "--mode=verify" || arg === "verify") mode = "verify";
    if (arg === "--dry-run" || arg === "dry-run") dryRun = true;
    if (arg.startsWith("--source=")) source = arg.split("=")[1];
    // Handle npm run ingest:source=X (hyphenated form)
    if (arg.startsWith("source=")) source = arg.split("=")[1];
  }

  return { mode, dryRun, source };
}

async function main() {
  const { mode, dryRun, source } = parseArgs();

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !key) {
    console.error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    console.error("Set them in .env.local or environment variables.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n=== HR Hub Ingestion ===`);
  console.log(`Mode: ${mode} | Dry run: ${dryRun} | Source: ${source ?? "all"}`);
  console.log(`Supabase: ${url}\n`);

  if (source) {
    // Single source run
    const handler = SOURCES[source.toLowerCase()];
    if (!handler) {
      console.error(`Unknown source: ${source}`);
      console.error(`Available: ${Object.keys(SOURCES).join(", ")}`);
      process.exit(1);
    }
    const stats = await handler.ingest({ mode, dryRun, supabase });
    console.log("\nResult:", JSON.stringify(stats, null, 2));
    if (stats.errors.length > 0) process.exit(1);
    return;
  }

  // Full run: order matters
  if (mode === "seed") {
    console.log("--- Step 1/3: Employee Master (Source A) ---");
    const empStats = await employeeMaster.ingest({ mode, dryRun, supabase });
    console.log("Employee Master:", JSON.stringify(empStats, null, 2));

    console.log("\n--- Step 2/3: Separation Summary (Source D) ---");
    const sepStats = await separationSummary.ingest({ mode, dryRun, supabase });
    console.log("Separation Summary:", JSON.stringify(sepStats, null, 2));

    console.log("\n--- Step 3/3: Attendance Tracker (Source B) ---");
    const attStats = await attendanceTracker.ingest({ mode, dryRun, supabase });
    console.log("Attendance Tracker:", JSON.stringify(attStats, null, 2));

    const totalErrors = empStats.errors.length + sepStats.errors.length + attStats.errors.length;
    if (totalErrors > 0) {
      console.error(`\n${totalErrors} total errors. Check output above.`);
      process.exit(1);
    }
    console.log("\nSeed complete.");
  } else {
    // Refresh: pull Google Sheets only (A then B)
    console.log("--- Refreshing Employee Master (Source A) ---");
    const empStats = await employeeMaster.ingest({ mode, dryRun, supabase });
    console.log("Employee Master:", JSON.stringify(empStats, null, 2));

    console.log("\n--- Refreshing Attendance Tracker (Source B) ---");
    const attStats = await attendanceTracker.ingest({ mode, dryRun, supabase });
    console.log("Attendance Tracker:", JSON.stringify(attStats, null, 2));

    if (empStats.errors.length + attStats.errors.length > 0) process.exit(1);
    console.log("\nRefresh complete.");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
