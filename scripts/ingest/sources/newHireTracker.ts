/**
 * Source C — New Hire Tracker (Monthly_New_Hire_Tracker.xlsm)
 *
 * Reads all 12 monthly sheets. Each sheet has:
 * - Row 4: Headers (#, Dept, Last Name, First Name, Bkgrd, DOH, Location/Title,
 *           Assigned, Relias, 3 Phase, Job Desc, CPR/FA, Med Cert, UKERU, Mealtime,
 *           Therapy, ITSP, Delegation, Status)
 * - Rows 5-29: New Hires
 * - Rows 34-58: Transfers
 *
 * Creates new_hires records + logs training completions.
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDate, toISODate } from "../normalize.js";
import {
  createIngestionRun,
  finishIngestionRun,
  type RunStats,
} from "../runLogger.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Column positions (0-indexed) matching the standard layout
const COL = {
  NUM: 0, DEPT: 1, LAST: 2, FIRST: 3, BKGRD: 4, DOH: 5,
  LOCATION: 6, ASSIGNED: 7, RELIAS: 8, THREE_PHASE: 9, JOB_DESC: 10,
  CPR: 11, MED: 12, UKERU: 13, MEALTIME: 14,
  THERAPY: 15, ITSP: 16, DELEGATION: 17, STATUS: 18,
};

// Training column index → training code
const TRAINING_COLS: { col: number; code: string }[] = [
  { col: COL.CPR, code: "CPR_FA" },
  { col: COL.MED, code: "MED_TRAIN" },
  { col: COL.UKERU, code: "UKERU" },
  { col: COL.MEALTIME, code: "MEALTIME" },
];

function extractYear(title: string): number | null {
  const match = title.match(/20\d{2}/);
  return match ? parseInt(match[0], 10) : null;
}

function mapStatus(val: string): "compliant" | "failed" | "exempt" | null {
  const v = val.trim().toUpperCase();
  if (["YES", "Y", "PASS", "PASSED", "COMPLETE", "COMPLETED"].includes(v)) return "compliant";
  if (["NO", "N", "FAIL", "FAILED"].includes(v)) return "failed";
  if (["N/A", "NA", "EXEMPT"].includes(v)) return "exempt";
  if (["IN PROGRESS", "PENDING", "SCHEDULED", ""].includes(v)) return null;
  return null;
}

export async function ingest(options: {
  filepath?: string;
  mode: "seed" | "refresh" | "verify";
  dryRun: boolean;
  supabase: SupabaseClient;
}): Promise<RunStats> {
  const { supabase, dryRun } = options;
  const stats: RunStats = { processed: 0, inserted: 0, updated: 0, skipped: 0, unresolved: 0, errors: [] };

  const filepath = options.filepath
    ?? path.resolve(process.cwd(), "Monthly New Hire Tracker.xlsm");

  if (!fs.existsSync(filepath)) {
    const alt = path.resolve(process.cwd(), "data/sources/Monthly New Hire Tracker.xlsm");
    if (!fs.existsSync(alt)) {
      stats.errors.push(`File not found: ${filepath}`);
      return stats;
    }
  }

  const runId = dryRun
    ? "dry-run"
    : await createIngestionRun(supabase, "new_hire_tracker", "manual");

  const wb = XLSX.readFile(filepath, { type: "file", cellDates: true });

  // Preload training IDs
  const { data: trainings } = await supabase.from("trainings").select("id, code");
  const trainingMap = new Map((trainings ?? []).map(t => [t.code, t.id]));

  for (const month of MONTHS) {
    const ws = wb.Sheets[month];
    if (!ws) continue;

    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });
    if (data.length < 5) continue;

    // Extract year from row 1 title
    const title = String((data[0] as string[])[0] ?? "");
    const year = extractYear(title);

    console.log(`[newHireTracker] ${month} ${year ?? "?"}: processing...`);

    // Process new hires (rows 5-29) and transfers (rows 34-58)
    const ranges = [
      { start: 4, end: 29, type: "new_hire" as const },
      { start: 33, end: 58, type: "transfer" as const },
    ];

    for (const range of ranges) {
      for (let r = range.start; r < Math.min(range.end, data.length); r++) {
        const row = data[r] as unknown[];
        if (!row) continue;

        const lastName = String(row[COL.LAST] ?? "").trim();
        const firstName = String(row[COL.FIRST] ?? "").trim();
        if (!lastName || !firstName) continue;

        stats.processed++;

        const dept = String(row[COL.DEPT] ?? "").trim();
        const location = String(row[COL.LOCATION] ?? "").trim();
        const statusRaw = String(row[COL.STATUS] ?? "").trim().toUpperCase();
        const dohRaw = row[COL.DOH];
        const doh = parseDate(dohRaw as string | number);

        // Skip terminated/resigned
        if (["TERMINATED", "RESIGNED", "NCNS", "QUIT"].includes(statusRaw)) {
          stats.skipped++;
          continue;
        }

        if (dryRun) {
          console.log(`  [DRY] ${range.type}: ${firstName} ${lastName} (${dept}) DOH=${doh ? toISODate(doh) : "?"}`);
          stats.inserted++;
          continue;
        }

        // Upsert new_hires record
        const { data: existing } = await supabase
          .from("new_hires")
          .select("id")
          .ilike("legal_last_name", lastName)
          .ilike("legal_first_name", firstName)
          .eq("hire_month", month)
          .maybeSingle();

        if (existing) {
          await supabase.from("new_hires").update({
            department: dept || null,
            position: location || null,
            offer_accepted_date: doh ? toISODate(doh) : null,
            stage: statusRaw === "ACTIVE" ? "complete" : "offer_accepted",
          }).eq("id", existing.id);
          stats.updated++;
        } else {
          await supabase.from("new_hires").insert({
            legal_first_name: firstName,
            legal_last_name: lastName,
            department: dept || null,
            position: location || null,
            offer_accepted_date: doh ? toISODate(doh) : null,
            planned_start_date: doh ? toISODate(doh) : null,
            actual_start_date: doh ? toISODate(doh) : null,
            stage: statusRaw === "ACTIVE" ? "complete" : "offer_accepted",
            hire_month: month,
            hire_year: year,
            ingest_source: "tracker_xlsm",
          });
          stats.inserted++;
        }

        // Resolve employee for training completions
        const { data: emp } = await supabase
          .from("employees")
          .select("id")
          .ilike("legal_last_name", lastName)
          .ilike("legal_first_name", `${firstName}%`)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (!emp) continue;

        // Log training completions
        for (const tc of TRAINING_COLS) {
          const cellVal = String(row[tc.col] ?? "").trim();
          const status = mapStatus(cellVal);
          if (!status) continue;

          const trainingId = trainingMap.get(tc.code);
          if (!trainingId) continue;

          const completedOn = doh ? toISODate(doh) : new Date().toISOString().slice(0, 10);

          await supabase.from("completions").upsert({
            employee_id: emp.id,
            training_id: trainingId,
            completed_on: completedOn,
            status: status === "exempt" ? "exempt" : status === "failed" ? "failed" : "compliant",
            exempt_reason: status === "exempt" ? "N/A" : null,
            source: "tracker_xlsm",
          }, { onConflict: "employee_id,training_id,completed_on,source", ignoreDuplicates: true });
        }
      }
    }
  }

  console.log(`[newHireTracker] Done: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped`);
  if (!dryRun) await finishIngestionRun(supabase, runId, stats);
  return stats;
}
