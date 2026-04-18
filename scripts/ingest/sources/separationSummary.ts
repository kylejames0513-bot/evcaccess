/**
 * Source D — Separations (FY_Separation_Summary.xlsx)
 *
 * Reads FY sheets (FY 2023 through FY 2027). Each sheet has monthly
 * sections with a repeating header row:
 *   Name, Date of Separation, DOH, Length of Service, Eligible for Rehire,
 *   Status, Location, Reason for Leaving, Supervisor, Exit Interview Date,
 *   Job, Comments, Department
 *
 * Ignores: Dashboard, Multi-Year Analytics, Data, Reference
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDate, toISODate } from "../normalize";
import {
  createIngestionRun,
  finishIngestionRun,
  addToReviewQueue,
  type RunStats,
} from "../runLogger";

function isFYSheet(name: string): boolean {
  return /^FY\s*\d{4}/i.test(name.trim());
}

function parseRehire(val: string): "yes" | "no" | "conditional" {
  const v = val.trim().toLowerCase();
  if (["yes", "y"].includes(v)) return "yes";
  if (["no", "n"].includes(v)) return "no";
  return "conditional";
}

function parseSepType(val: string): string {
  const v = val.trim().toLowerCase();
  if (v.includes("termination") || v.includes("fired")) return "involuntary";
  if (v.includes("better opportunity") || v.includes("personal") || v.includes("relocated") || v.includes("resign")) return "voluntary";
  if (v.includes("abandon") || v.includes("ncns") || v.includes("no call")) return "job_abandonment";
  if (v.includes("retire")) return "retirement";
  if (v.includes("death") || v.includes("deceased")) return "death";
  if (v.includes("layoff") || v.includes("rif")) return "layoff";
  if (v.includes("end of contract")) return "end_of_contract";
  // "Other", "unknown", or anything else
  return "other";
}

export async function ingest(options: {
  filepath?: string;
  mode: "seed" | "refresh" | "verify";
  dryRun: boolean;
  supabase: SupabaseClient;
}): Promise<RunStats> {
  const { supabase, dryRun } = options;
  const stats: RunStats = { processed: 0, inserted: 0, updated: 0, skipped: 0, unresolved: 0, errors: [] };

  const candidates = [
    options.filepath,
    path.resolve(process.cwd(), "workbooks/FY Separation Summary.xlsx"),
    path.resolve(process.cwd(), "data/sources/FY Separation Summary.xlsx"),
    path.resolve(process.cwd(), "FY Separation Summary.xlsx"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  const filepath = candidates.find((p) => fs.existsSync(p));
  if (!filepath) {
    stats.errors.push(`File not found; tried: ${candidates.join(", ")}`);
    return stats;
  }

  const runId = dryRun
    ? "dry-run"
    : await createIngestionRun(supabase, "separation_xlsx", "manual");

  const wb = XLSX.readFile(filepath, { type: "file", cellDates: true });
  const fySheets = wb.SheetNames.filter(isFYSheet);
  console.log(`[separationSummary] Found FY sheets: ${fySheets.join(", ")}`);

  for (const sheetName of fySheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });

    // Find all header rows (they repeat per month section)
    // Header has "Name" in col 0 and "Date of Separation" in col 1
    const headerIndices: number[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i] as string[];
      if (row && String(row[0] ?? "").trim().toLowerCase() === "name" &&
          String(row[1] ?? "").trim().toLowerCase().includes("separation")) {
        headerIndices.push(i);
      }
    }

    if (headerIndices.length === 0) {
      console.warn(`[separationSummary] No header rows found in "${sheetName}"`);
      continue;
    }

    console.log(`[separationSummary] Sheet "${sheetName}": ${headerIndices.length} monthly sections`);

    // Process data rows between each header and the next header (or end of sheet)
    for (let h = 0; h < headerIndices.length; h++) {
      const headerIdx = headerIndices[h];
      const nextHeader = h + 1 < headerIndices.length ? headerIndices[h + 1] : allRows.length;

      // Detect columns from header row
      const header = (allRows[headerIdx] as string[]).map(c => String(c ?? "").trim().toLowerCase());
      const colName = header.indexOf("name");
      const colSepDate = header.findIndex(h => h.includes("date of separation") || h.includes("sep date"));
      const colDoh = header.findIndex(h => h.includes("doh") || h.includes("date of hire") || h === "doh");
      const colRehire = header.findIndex(h => h.includes("rehire"));
      const colLocation = header.findIndex(h => h.includes("location"));
      const colReason = header.findIndex(h => h.includes("reason"));
      const colSupervisor = header.findIndex(h => h.includes("supervisor"));
      const colExit = header.findIndex(h => h.includes("exit"));
      const colJob = header.findIndex(h => h === "job");
      const colComments = header.findIndex(h => h.includes("comment"));
      const colDept = header.findIndex(h => h.includes("department"));
      const colStatus = header.findIndex(h => h === "status");

      for (let r = headerIdx + 1; r < nextHeader; r++) {
        const row = allRows[r] as unknown[];
        if (!row) continue;

        const name = String(row[colName] ?? "").trim();
        if (!name) continue;

        // Skip month headers that sneak in (e.g., "FEBRUARY 2026")
        if (/^[A-Z]+\s+\d{4}$/.test(name)) continue;

        stats.processed++;

        const sepDateRaw = row[colSepDate >= 0 ? colSepDate : 1];
        const sepDate = parseDate(sepDateRaw as string | number);
        if (!sepDate) { stats.skipped++; continue; }

        const dohRaw = colDoh >= 0 ? row[colDoh] : null;
        const doh = dohRaw ? parseDate(dohRaw as string | number) : null;

        const rehireRaw = colRehire >= 0 ? String(row[colRehire] ?? "").trim() : "";
        const reason = colReason >= 0 ? String(row[colReason] ?? "").trim() : "";
        const location = colLocation >= 0 ? String(row[colLocation] ?? "").trim() : "";
        const supervisor = colSupervisor >= 0 ? String(row[colSupervisor] ?? "").trim() : "";
        const exitRaw = colExit >= 0 ? String(row[colExit] ?? "").trim() : "";
        const job = colJob >= 0 ? String(row[colJob] ?? "").trim() : "";
        const comments = colComments >= 0 ? String(row[colComments] ?? "").trim() : "";
        const dept = colDept >= 0 ? String(row[colDept] ?? "").trim() : "";
        const statusCode = colStatus >= 0 ? String(row[colStatus] ?? "").trim() : "";

        // Parse separation type from reason + status code
        let sepType = parseSepType(reason);
        // Status "D" often means discharged/involuntary, "U" = unknown/other
        if (statusCode.toUpperCase() === "D" && sepType === "other") sepType = "involuntary";

        // Parse exit interview
        let exitStatus: "completed" | "declined" | "scheduled" | "not_done" = "not_done";
        if (exitRaw) {
          const exitDate = parseDate(exitRaw);
          if (exitDate) exitStatus = "completed";
          else if (exitRaw.toLowerCase().includes("no response") || exitRaw.toUpperCase() === "N/A") exitStatus = "declined";
          else if (exitRaw.toLowerCase().includes("scheduled")) exitStatus = "scheduled";
        }

        const record = {
          legal_name: name,
          position: job || null,
          department: dept || null,
          supervisor_name_raw: supervisor || null,
          hire_date: doh ? toISODate(doh) : null,
          separation_date: toISODate(sepDate),
          separation_type: sepType,
          reason_primary: reason || null,
          rehire_eligible: parseRehire(rehireRaw),
          exit_interview_status: exitStatus,
          hr_notes: [comments, location ? `Location: ${location}` : ""].filter(Boolean).join(". ") || null,
          ingest_source: "separation_xlsx",
        };

        if (dryRun) {
          console.log(`  [DRY] ${record.legal_name} — ${record.separation_date} — ${record.separation_type}`);
          stats.inserted++;
          continue;
        }

        // Dedup by name + separation date
        const { data: existing } = await supabase
          .from("separations")
          .select("id")
          .eq("legal_name", record.legal_name)
          .eq("separation_date", record.separation_date)
          .maybeSingle();

        if (existing) {
          await supabase.from("separations").update(record).eq("id", existing.id);
          stats.updated++;
        } else {
          const { error } = await supabase.from("separations").insert(record);
          if (error) {
            stats.errors.push(`Insert failed for ${record.legal_name}: ${error.message}`);
          } else {
            stats.inserted++;
          }
        }

        // Try to link to employee record
        const nameParts = name.includes(",")
          ? name.split(",").map(p => p.trim())
          : name.split(/\s+/);
        let empLastName = "", empFirstName = "";
        if (name.includes(",")) {
          empLastName = nameParts[0];
          empFirstName = nameParts.slice(1).join(" ");
        } else {
          empFirstName = nameParts[0];
          empLastName = nameParts.slice(1).join(" ");
        }

        if (empLastName && empFirstName) {
          const { data: emp } = await supabase
            .from("employees")
            .select("id")
            .ilike("legal_last_name", empLastName)
            .ilike("legal_first_name", `${empFirstName}%`)
            .limit(1)
            .maybeSingle();

          if (emp && existing) {
            await supabase.from("separations").update({ employee_id: emp.id }).eq("id", existing.id);
          }
        }
      }
    }
  }

  console.log(`[separationSummary] Done: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors.length} errors`);
  if (!dryRun) await finishIngestionRun(supabase, runId, stats);
  return stats;
}
