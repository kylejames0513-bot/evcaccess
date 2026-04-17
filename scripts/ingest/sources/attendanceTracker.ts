/**
 * Source B — Training Completions (Google Sheet, live CSV)
 *
 * Published CSV from EVC_Attendance_Tracker, Training tab.
 * Column mapping:
 *   0: L NAME, 1: F NAME, 3: CPR, 4: FIRSTAID, 5: MED_TRAIN, 7: Mealtime, 9: Ukeru
 *
 * Value semantics:
 * - Valid date → compliant
 * - "FAIL..." → failed
 * - Excusal codes → exempt
 * - Blank → skip
 *
 * CPR/FA combining rule: max date of cols 3 and 4 → single CPR_FA completion.
 * Skip terminated/resigned/ncns employees.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { parseDate, toISODate, parseCompletionValue, shouldSkipForCompletions, extractNameVariants } from "../normalize";
import { resolveEmployeeWithSuggestion } from "../resolver";
import { hashCompletion } from "../idempotency";
import {
  createIngestionRun,
  finishIngestionRun,
  addToReviewQueue,
  writeAuditEntry,
  type RunStats,
} from "../runLogger";

/** Column index → training code mapping */
const TRAINING_COLUMNS: { index: number; code: string }[] = [
  { index: 3, code: "CPR" },       // Will be combined with FIRSTAID
  { index: 4, code: "FIRSTAID" },  // Combined into CPR_FA
  { index: 5, code: "MED_TRAIN" },
  { index: 7, code: "MEALTIME" },
  { index: 9, code: "UKERU" },
];

const ATTENDANCE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrqHNYlebocrv8AARfLon065YuST3Yo_PSwH5WGoBK6B4bjlBKGNGlX82ccLq5kZqkZ5Devknz2oho/pub?gid=313450341&single=true&output=csv";

export async function ingest(options: {
  url?: string;
  mode: "seed" | "refresh" | "verify";
  dryRun: boolean;
  supabase: SupabaseClient;
}): Promise<RunStats> {
  const { supabase, mode, dryRun } = options;
  const stats: RunStats = { processed: 0, inserted: 0, updated: 0, skipped: 0, unresolved: 0, errors: [] };

  const csvUrl = options.url ?? process.env.ATTENDANCE_TRACKER_CSV_URL ?? ATTENDANCE_CSV_URL;

  const runId = dryRun
    ? "dry-run"
    : await createIngestionRun(supabase, "attendance_tracker", mode === "seed" ? "seed" : "cron");

  // Fetch CSV
  let csvText: string;
  try {
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csvText = await resp.text();
  } catch (e) {
    stats.errors.push(`Failed to fetch CSV: ${e instanceof Error ? e.message : String(e)}`);
    if (!dryRun) await finishIngestionRun(supabase, runId, stats);
    return stats;
  }

  const parsed = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  if (parsed.data.length < 2) {
    stats.errors.push("CSV has no data rows");
    if (!dryRun) await finishIngestionRun(supabase, runId, stats);
    return stats;
  }

  // Skip header row
  const dataRows = parsed.data.slice(1);
  console.log(`[attendanceTracker] Processing ${dataRows.length} rows...`);

  // Preload training code → training UUID mapping
  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code");

  const trainingMap = new Map<string, string>();
  for (const t of trainings ?? []) {
    trainingMap.set(t.code, t.id);
  }

  // Ensure CPR_FA exists in map
  if (!trainingMap.has("CPR_FA")) {
    console.warn("[attendanceTracker] Warning: CPR_FA training not found in catalog");
  }

  for (const row of dataRows) {
    stats.processed++;

    const lastName = (row[0] ?? "").trim();
    const firstNameRaw = (row[1] ?? "").trim();

    if (!lastName && !firstNameRaw) {
      stats.skipped++;
      continue;
    }

    // Resolve employee. The F NAME cell can carry quoted / parenthesized
    // nicknames ("Michael \"Mike\""); try each variant in turn and keep
    // the first confident match.
    const { primary, variants } = extractNameVariants(firstNameRaw);
    const firstName = primary || firstNameRaw;
    const candidates = [firstName, ...variants];
    let match: Awaited<ReturnType<typeof resolveEmployeeWithSuggestion>>["match"] = null;
    let suggested: Awaited<ReturnType<typeof resolveEmployeeWithSuggestion>>["suggested"] = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const attempt = await resolveEmployeeWithSuggestion(lastName, candidate, supabase);
      if (attempt.match) {
        match = attempt.match;
        break;
      }
      if (!suggested && attempt.suggested) suggested = attempt.suggested;
    }

    if (!match) {
      stats.unresolved++;
      if (!dryRun) {
        await addToReviewQueue(supabase, {
          ingestion_run_id: runId,
          source: "attendance_tracker",
          reason: "name_not_resolved",
          raw_payload: { lastName, firstName, row: row.slice(0, 10) },
          suggested_match_employee_id: suggested?.employeeDbId,
          suggested_match_score: suggested?.score,
        });
      }
      continue;
    }

    // Check if employee should be skipped (terminated, etc.)
    const { data: emp } = await supabase
      .from("employees")
      .select("status")
      .eq("id", match.employeeDbId)
      .maybeSingle();

    if (emp && shouldSkipForCompletions(emp.status)) {
      stats.skipped++;
      continue;
    }

    // Process CPR/FA combining rule: take max date of cols 3 and 4
    const cprVal = parseCompletionValue(row[3]);
    const faVal = parseCompletionValue(row[4]);
    let cprFaDate: Date | null = null;
    let cprFaStatus: "compliant" | "failed" | "exempt" = "compliant";
    let cprFaExemptReason: string | undefined;

    if (cprVal.status === "exempt") {
      cprFaStatus = "exempt";
      cprFaExemptReason = cprVal.exemptReason;
    } else if (faVal.status === "exempt") {
      cprFaStatus = "exempt";
      cprFaExemptReason = faVal.exemptReason;
    } else if (cprVal.status === "failed" || faVal.status === "failed") {
      cprFaStatus = "failed";
    } else {
      // Take the more recent date
      if (cprVal.completedOn && faVal.completedOn) {
        cprFaDate = cprVal.completedOn > faVal.completedOn ? cprVal.completedOn : faVal.completedOn;
      } else {
        cprFaDate = cprVal.completedOn ?? faVal.completedOn ?? null;
      }
    }

    // Insert CPR_FA completion
    if (cprFaDate || cprFaStatus === "exempt" || cprFaStatus === "failed") {
      const trainingId = trainingMap.get("CPR_FA");
      if (trainingId) {
        const completedOn = cprFaDate ? toISODate(cprFaDate) : null;
        const hash = hashCompletion(match.employeeId, "CPR_FA", completedOn ?? "none", "attendance_tracker");

        if (!dryRun) {
          const { error } = await supabase.from("completions").upsert(
            {
              employee_id: match.employeeDbId,
              training_id: trainingId,
              completed_on: completedOn,
              status: cprFaStatus,
              exempt_reason: cprFaExemptReason ?? null,
              source: "attendance_tracker",
              source_row_hash: hash,
            },
            { onConflict: "employee_id,training_id,completed_on,source", ignoreDuplicates: true }
          );
          if (error && !error.message.includes("duplicate")) {
            stats.errors.push(`CPR_FA insert for ${match.employeeId}: ${error.message}`);
          } else {
            stats.inserted++;
          }
        } else {
          stats.inserted++;
        }
      }
    }

    // Process remaining training columns (MED_TRAIN, MEALTIME, UKERU)
    const otherCols = TRAINING_COLUMNS.filter((c) => c.code !== "CPR" && c.code !== "FIRSTAID");
    for (const col of otherCols) {
      const cellValue = row[col.index];
      const parsed = parseCompletionValue(cellValue);

      if (parsed.status === "skip") continue;

      const trainingId = trainingMap.get(col.code);
      if (!trainingId) {
        console.warn(`[attendanceTracker] Training code ${col.code} not found in catalog`);
        continue;
      }

      const completedOn = parsed.completedOn ? toISODate(parsed.completedOn) : null;
      const hash = hashCompletion(match.employeeId, col.code, completedOn ?? "none", "attendance_tracker");

      if (!dryRun) {
        const { error } = await supabase.from("completions").upsert(
          {
            employee_id: match.employeeDbId,
            training_id: trainingId,
            completed_on: completedOn,
            status: parsed.status === "exempt" ? "exempt" : parsed.status === "failed" ? "failed" : "compliant",
            exempt_reason: parsed.exemptReason ?? null,
            source: "attendance_tracker",
            source_row_hash: hash,
            notes: parsed.notes ?? null,
          },
          { onConflict: "employee_id,training_id,completed_on,source", ignoreDuplicates: true }
        );
        if (error && !error.message.includes("duplicate")) {
          stats.errors.push(`${col.code} insert for ${match.employeeId}: ${error.message}`);
        } else {
          stats.inserted++;
        }
      } else {
        stats.inserted++;
      }
    }
  }

  console.log(
    `[attendanceTracker] Done: ${stats.inserted} completions, ${stats.unresolved} unresolved, ${stats.skipped} skipped, ${stats.errors.length} errors`
  );
  if (!dryRun) await finishIngestionRun(supabase, runId, stats);
  return stats;
}
