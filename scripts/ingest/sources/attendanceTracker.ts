/**
 * Source B — Training Completions (Google Sheet, live CSV)
 *
 * Published CSV from the EVC_Attendance_Tracker workbook, typically
 * the "Training" or "Merged" tab.
 *
 * Column detection is now **header-aware** — we look at the header
 * row for `L NAME` / `F NAME` (plus aliases) to find the identity
 * columns, and every remaining header whose text matches a
 * `trainings.code` in Supabase is treated as a training column.
 * This works for both the legacy Training-only layout (5 hardcoded
 * positions) and the Merged layout that combines identity +
 * demographics + all 30+ training columns in one sheet.
 *
 * Value semantics (per cell):
 *   Valid date     → compliant
 *   Starts "FAIL…" → failed
 *   Excusal code   → exempt
 *   Blank          → skip
 *
 * Skip terminated / resigned / NCNS employees.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import {
  toISODate,
  parseCompletionValue,
  shouldSkipForCompletions,
  extractNameVariants,
} from "../normalize";
import { resolveEmployeeWithSuggestion } from "../resolver";
import { hashCompletion } from "../idempotency";
import {
  createIngestionRun,
  finishIngestionRun,
  addToReviewQueue,
  type RunStats,
} from "../runLogger";

const ATTENDANCE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrqHNYlebocrv8AARfLon065YuST3Yo_PSwH5WGoBK6B4bjlBKGNGlX82ccLq5kZqkZ5Devknz2oho/pub?gid=313450341&single=true&output=csv";

/** Normalize a header for code matching: strip spaces / underscores / slashes / dashes, lowercase. */
function normHeader(s: string): string {
  return String(s ?? "").trim().toLowerCase().replace(/[\s_/\-]+/g, "");
}

/** Find the 0-based index of the first header matching any of the candidate names. */
function findCol(headers: string[], candidates: string[]): number {
  const wanted = candidates.map((c) => c.trim().toLowerCase());
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] ?? "").trim().toLowerCase();
    if (wanted.includes(h)) return i;
  }
  return -1;
}

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

  const header = parsed.data[0] ?? [];
  const dataRows = parsed.data.slice(1);

  // --- Detect identity columns by header name ---------------------------------
  const lnIdx = findCol(header, ["L NAME", "LAST NAME", "LAST", "LAST_NAME"]);
  const fnIdx = findCol(header, ["F NAME", "FIRST NAME", "FIRST", "FIRST_NAME"]);
  const activeIdx = findCol(header, ["ACTIVE", "STATUS"]);
  const idIdx = findCol(header, ["ID", "EMPLOYEE ID", "EMPLOYEE_ID"]);

  if (lnIdx < 0 || fnIdx < 0) {
    stats.errors.push(
      `Missing L NAME / F NAME headers. Saw: [${header.map((h) => JSON.stringify(h)).join(", ")}]`,
    );
    if (!dryRun) await finishIngestionRun(supabase, runId, stats);
    return stats;
  }

  // --- Preload training catalog ----------------------------------------------
  const { data: trainings } = await supabase.from("trainings").select("id, code");
  const trainingByCode = new Map<string, string>(); // exact code → id
  const trainingByNormCode = new Map<string, { code: string; id: string }>(); // normalized code → { code, id }
  for (const t of trainings ?? []) {
    trainingByCode.set(t.code, t.id);
    trainingByNormCode.set(normHeader(t.code), { code: t.code, id: t.id });
  }

  // --- Discover training columns from the remaining headers ------------------
  // Any header that maps to a trainings.code (exact or whitespace/underscore-
  // insensitive) becomes an ingestable training column. Identity/admin
  // columns are excluded.
  const skipIdxs = new Set([lnIdx, fnIdx, activeIdx, idIdx].filter((i) => i >= 0));
  const trainingColumns: { index: number; code: string; trainingId: string }[] = [];
  const unmatchedHeaders: string[] = [];
  for (let i = 0; i < header.length; i++) {
    if (skipIdxs.has(i)) continue;
    const hdr = String(header[i] ?? "").trim();
    if (!hdr) continue;
    // Identity/demographic columns to explicitly ignore
    const lc = hdr.toLowerCase();
    if (["division", "department", "position title", "position", "hire date", "aliases", "alias", "known aliases"].includes(lc)) {
      continue;
    }
    const exact = trainingByCode.get(hdr);
    if (exact) {
      trainingColumns.push({ index: i, code: hdr, trainingId: exact });
      continue;
    }
    const norm = trainingByNormCode.get(normHeader(hdr));
    if (norm) {
      trainingColumns.push({ index: i, code: norm.code, trainingId: norm.id });
      continue;
    }
    unmatchedHeaders.push(hdr);
  }

  console.log(
    `[attendanceTracker] Header detected — L NAME@${lnIdx}, F NAME@${fnIdx}, ` +
      `${trainingColumns.length} training column(s) matched, ` +
      `${unmatchedHeaders.length} unmatched (${unmatchedHeaders.slice(0, 5).join(", ")}${unmatchedHeaders.length > 5 ? "…" : ""})`,
  );

  if (trainingColumns.length === 0) {
    stats.errors.push(
      "No training columns matched the trainings catalog. " +
        "Make sure trainings.code values match the headers on your sheet (case-insensitive, whitespace/underscore tolerant).",
    );
    if (!dryRun) await finishIngestionRun(supabase, runId, stats);
    return stats;
  }

  console.log(`[attendanceTracker] Processing ${dataRows.length} rows...`);

  for (const row of dataRows) {
    stats.processed++;

    const lastName = String(row[lnIdx] ?? "").trim();
    const firstNameRaw = String(row[fnIdx] ?? "").trim();
    if (!lastName && !firstNameRaw) {
      stats.skipped++;
      continue;
    }

    // Optional early-out: ACTIVE column says this row shouldn't count.
    if (activeIdx >= 0) {
      const active = String(row[activeIdx] ?? "").trim().toLowerCase();
      if (active && ["n", "no", "inactive", "terminated", "term", "false", "0"].includes(active)) {
        stats.skipped++;
        continue;
      }
    }

    // Resolve employee — try each extracted variant of the F NAME cell.
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

    // Skip if the employee is terminated / inactive on the Supabase side.
    const { data: emp } = await supabase
      .from("employees")
      .select("status")
      .eq("id", match.employeeDbId)
      .maybeSingle();
    if (emp && shouldSkipForCompletions(emp.status)) {
      stats.skipped++;
      continue;
    }

    // Walk every discovered training column and upsert if there's content.
    for (const col of trainingColumns) {
      const cellValue = row[col.index];
      const out = parseCompletionValue(cellValue);
      if (out.status === "skip") continue;

      const completedOn = out.completedOn ? toISODate(out.completedOn) : null;
      const hash = hashCompletion(
        match.employeeId,
        col.code,
        completedOn ?? "none",
        "attendance_tracker",
      );

      if (!dryRun) {
        const { error } = await supabase.from("completions").upsert(
          {
            employee_id: match.employeeDbId,
            training_id: col.trainingId,
            completed_on: completedOn,
            status:
              out.status === "exempt" ? "exempt" : out.status === "failed" ? "failed" : "compliant",
            exempt_reason: out.exemptReason ?? null,
            source: "attendance_tracker",
            source_row_hash: hash,
            notes: out.notes ?? null,
          },
          { onConflict: "employee_id,training_id,completed_on,source", ignoreDuplicates: true },
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
    `[attendanceTracker] Done: ${stats.inserted} completions, ${stats.unresolved} unresolved, ${stats.skipped} skipped, ${stats.errors.length} errors`,
  );
  if (!dryRun) await finishIngestionRun(supabase, runId, stats);
  return stats;
}

