/**
 * Source D — Separations (FY_Separation_Summary.xlsx)
 *
 * Reads CY sheets only (CY 2023-2027), ignores Dashboard/Analytics/Data/FY views.
 * Upserts to separations table.
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseDate,
  toISODate,
  parseSeparationType,
  parseRehireEligible,
  parseExitInterviewStatus,
  normalizeName,
} from "../normalize.js";
import { resolveEmployeeWithSuggestion } from "../resolver.js";
import {
  createIngestionRun,
  finishIngestionRun,
  addToReviewQueue,
  type RunStats,
} from "../runLogger.js";

/** Only read CY sheets — skip dashboards and views */
function isCYSheet(name: string): boolean {
  return /^CY\s*\d{4}/i.test(name.trim());
}

/** Flexible column detection for separation sheets */
const COL_ALIASES: Record<string, string[]> = {
  name: ["employee name", "name", "employee", "last, first"],
  position: ["position", "job", "role", "title", "job title"],
  department: ["department", "dept"],
  hire_date: ["hire date", "doh", "date of hire"],
  separation_date: ["separation date", "sep date", "term date", "termination date", "date of separation"],
  separation_type: ["separation type", "type", "sep type"],
  reason: ["reason", "reason (primary)", "primary reason", "reason primary"],
  reason_secondary: ["reason (secondary)", "secondary reason", "reason secondary"],
  rehire: ["eligible for rehire", "rehire", "rehire eligible", "eligible"],
  exit_interview: ["exit interview", "exit interview status", "exit"],
  notes: ["notes", "hr notes", "comments"],
};

function detectCols(headers: string[]): Map<string, number> {
  const mapping = new Map<string, number>();
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9\s()]/g, ""));

  for (const [canonical, aliases] of Object.entries(COL_ALIASES)) {
    for (let i = 0; i < norm.length; i++) {
      if (aliases.some((a) => norm[i] === a || norm[i].includes(a))) {
        mapping.set(canonical, i);
        break;
      }
    }
  }
  return mapping;
}

function getCell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined || idx >= row.length) return "";
  return String(row[idx] ?? "").trim();
}

export async function ingest(options: {
  filepath?: string;
  mode: "seed" | "refresh" | "verify";
  dryRun: boolean;
  supabase: SupabaseClient;
}): Promise<RunStats> {
  const { supabase, dryRun } = options;
  const stats: RunStats = { processed: 0, inserted: 0, updated: 0, skipped: 0, unresolved: 0, errors: [] };

  const filepath = options.filepath ?? path.resolve(process.cwd(), "FY Separation Summary.xlsx");
  if (!fs.existsSync(filepath)) {
    // Try data/sources
    const alt = path.resolve(process.cwd(), "data/sources/FY Separation Summary.xlsx");
    if (!fs.existsSync(alt)) {
      stats.errors.push(`File not found: ${filepath}`);
      return stats;
    }
  }

  const runId = dryRun
    ? "dry-run"
    : await createIngestionRun(supabase, "separation_xlsx", "manual");

  const wb = XLSX.readFile(filepath, { type: "file", cellDates: true });

  const cySheets = wb.SheetNames.filter(isCYSheet);
  console.log(`[separationSummary] Found CY sheets: ${cySheets.join(", ")}`);

  for (const sheetName of cySheets) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
    if (rows.length < 2) continue;

    // Find header row (first row with recognizable column names)
    let headerIdx = 0;
    let colMap: Map<string, number> | null = null;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const candidate = (rows[i] as string[]).map(String);
      const detected = detectCols(candidate);
      if (detected.has("separation_date") || detected.has("name")) {
        headerIdx = i;
        colMap = detected;
        break;
      }
    }

    if (!colMap) {
      console.warn(`[separationSummary] Could not detect columns in sheet "${sheetName}"`);
      continue;
    }

    console.log(`[separationSummary] Sheet "${sheetName}": ${rows.length - headerIdx - 1} data rows`);

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      stats.processed++;

      const nameRaw = getCell(row, colMap.get("name"));
      if (!nameRaw) { stats.skipped++; continue; }

      const sepDateRaw = getCell(row, colMap.get("separation_date"));
      const sepDate = parseDate(sepDateRaw);
      if (!sepDate) { stats.skipped++; continue; }

      // Parse "Last, First" name format
      let lastName = "";
      let firstName = "";
      if (nameRaw.includes(",")) {
        const parts = nameRaw.split(",").map((p) => p.trim());
        lastName = parts[0];
        firstName = parts.slice(1).join(" ");
      } else {
        const parts = nameRaw.split(/\s+/);
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }

      const hireDateRaw = getCell(row, colMap.get("hire_date"));
      const hireDate = parseDate(hireDateRaw);

      const separationType = parseSeparationType(getCell(row, colMap.get("separation_type")));
      const reason = getCell(row, colMap.get("reason"));
      const reasonSecondary = getCell(row, colMap.get("reason_secondary"));
      const rehire = parseRehireEligible(getCell(row, colMap.get("rehire")));
      const exitInterview = parseExitInterviewStatus(getCell(row, colMap.get("exit_interview")));
      const notes = getCell(row, colMap.get("notes"));
      const position = getCell(row, colMap.get("position"));
      const department = getCell(row, colMap.get("department"));

      // Try to resolve employee
      const { match, suggested } = await resolveEmployeeWithSuggestion(lastName, firstName, supabase);

      const record = {
        employee_id: match?.employeeDbId ?? null,
        legal_name: `${lastName}, ${firstName}`,
        position: position || null,
        department: department || null,
        hire_date: hireDate ? toISODate(hireDate) : null,
        separation_date: toISODate(sepDate),
        separation_type: separationType,
        reason_primary: reason || null,
        reason_secondary: reasonSecondary || null,
        rehire_eligible: rehire,
        exit_interview_status: exitInterview,
        hr_notes: notes || null,
        ingest_source: "separation_xlsx",
      };

      if (dryRun) {
        console.log(`  [DRY] ${record.legal_name} — ${record.separation_date} — ${record.separation_type}`);
        stats.inserted++;
        continue;
      }

      // Dedup: check if separation already exists for this person + date
      const { data: existing } = await supabase
        .from("separations")
        .select("id")
        .eq("legal_name", record.legal_name)
        .eq("separation_date", record.separation_date)
        .maybeSingle();

      if (existing) {
        // Update
        const { error } = await supabase
          .from("separations")
          .update(record)
          .eq("id", existing.id);
        if (error) stats.errors.push(`Update sep for ${record.legal_name}: ${error.message}`);
        else stats.updated++;
      } else {
        const { error } = await supabase
          .from("separations")
          .insert(record);
        if (error) stats.errors.push(`Insert sep for ${record.legal_name}: ${error.message}`);
        else stats.inserted++;
      }

      if (!match && suggested) {
        stats.unresolved++;
        await addToReviewQueue(supabase, {
          ingestion_run_id: runId,
          source: "separation_xlsx",
          reason: "name_not_resolved",
          raw_payload: { lastName, firstName, separation_date: toISODate(sepDate) },
          suggested_match_employee_id: suggested.employeeDbId,
          suggested_match_score: suggested.score,
        });
      }
    }
  }

  console.log(`[separationSummary] Done: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.unresolved} unresolved`);
  if (!dryRun) await finishIngestionRun(supabase, runId, stats);
  return stats;
}
