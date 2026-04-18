/**
 * Writeback: Supabase separations → workbooks/FY Separation Summary.xlsx
 *
 * For each unapplied pending_xlsx_writes row where source='separation_summary',
 * open the workbook, locate the correct FY sheet + monthly section, and insert
 * the row. Preserves existing styling by using { cellStyles: true } on read
 * and read-back writeFile.
 *
 * Fiscal-year rule (EVC): FY starts July 1. A separation on June 30, 2026
 * belongs to FY2026; July 1, 2026 belongs to FY2027.
 *
 * A simple file lock at workbooks/.FY_Separation_Summary.lock prevents
 * concurrent runs clobbering each other.
 */

import * as XLSX from "xlsx";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

type RunStats = {
  pending: number;
  applied: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type SeparationPayload = {
  id: string;
  legal_name: string;
  separation_date: string;
  hire_date?: string | null;
  department?: string | null;
  position?: string | null;
  separation_type?: string | null;
  reason_primary?: string | null;
  rehire_eligible?: string | null;
  exit_interview_status?: string | null;
  hr_notes?: string | null;
  supervisor_name_raw?: string | null;
  actor?: string | null;
};

const DEFAULT_XLSX_PATHS = [
  "workbooks/FY Separation Summary.xlsx",
  "data/sources/FY Separation Summary.xlsx",
  "FY Separation Summary.xlsx",
];

function findWorkbookPath(): string | null {
  for (const p of DEFAULT_XLSX_PATHS) {
    if (fs.existsSync(p)) return path.resolve(p);
  }
  return null;
}

function acquireLock(dir: string): () => void {
  const lockPath = path.join(dir, ".FY_Separation_Summary.lock");
  if (fs.existsSync(lockPath)) {
    const age = Date.now() - fs.statSync(lockPath).mtimeMs;
    const ageMin = Math.round(age / 60000);
    throw new Error(
      `Lock file exists (${lockPath}, ${ageMin} min old). If no other writeback is running, delete it and retry.`,
    );
  }
  fs.writeFileSync(lockPath, `${process.pid} ${new Date().toISOString()}\n${os.hostname()}\n`);
  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  };
}

/** Returns the EVC fiscal year for a YYYY-MM-DD date (FY starts July 1). */
function evcFiscalYear(isoDate: string): number {
  const [y, m] = isoDate.split("-").map((v) => parseInt(v, 10));
  if (!y || !m) throw new Error(`Invalid ISO date: ${isoDate}`);
  return m >= 7 ? y + 1 : y;
}

function monthUpper(isoDate: string): string {
  const [, m] = isoDate.split("-").map((v) => parseInt(v, 10));
  if (!m || m < 1 || m > 12) throw new Error(`Invalid month: ${isoDate}`);
  return MONTH_NAMES[m - 1];
}

function formatNameForSheet(legalName: string): string {
  // Keep whatever operator typed. Accept both "Doe, Jane" and "Jane Doe".
  return legalName.trim();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // Sheet uses M/D/YYYY; mimic that.
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function findFYSheetName(wb: XLSX.WorkBook, fy: number): string | null {
  // Sheet names look like "FY 2027 (Jan27-Dec27)".
  const pattern = new RegExp(`^FY\\s*${fy}\\b`, "i");
  return wb.SheetNames.find((n) => pattern.test(n.trim())) ?? null;
}

/**
 * Find the row block for a specific month section within an FY sheet. Returns
 * the indices of the header row ("Name"/"Date of Separation") and the last
 * data row for that month (inclusive).
 */
function findMonthBlock(
  rows: unknown[][],
  monthLabel: string,
): { headerIdx: number; lastDataIdx: number } | null {
  const label = monthLabel.toUpperCase();
  let monthRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const a = String(((rows[i] ?? [])[0]) ?? "").trim().toUpperCase();
    if (a.startsWith(label) && /\d{4}$/.test(a)) {
      monthRow = i;
      break;
    }
  }
  if (monthRow === -1) return null;

  // Header row is usually monthRow+1
  let headerIdx = -1;
  for (let i = monthRow + 1; i < Math.min(rows.length, monthRow + 5); i++) {
    const a = String(((rows[i] ?? [])[0]) ?? "").trim().toLowerCase();
    if (a === "name") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  // Last data row = last index before the next month header or end-of-sheet
  let lastDataIdx = rows.length - 1;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const a = String(((rows[i] ?? [])[0]) ?? "").trim().toUpperCase();
    if (MONTH_NAMES.some((m) => a.startsWith(m)) && /\d{4}$/.test(a)) {
      lastDataIdx = i - 1;
      break;
    }
    // Empty month block bail-outs — stop at the next visible text block that
    // clearly isn't data (e.g. "FY SUMMARY" / "TOR %").
    if (/^(fy\s|tor|summary)/i.test(a) && i > headerIdx + 1) {
      lastDataIdx = i - 1;
      break;
    }
  }
  return { headerIdx, lastDataIdx };
}

function buildSheetRow(p: SeparationPayload): unknown[] {
  // Column order matches the xlsx header row exactly:
  // Name | Date of Separation | DOH | Length of Service | Eligible for Rehire
  //   | Status | Location | Reason for Leaving | Supervisor
  //   | Exit Interview Date | Job | Comments | Department
  const sepDate = p.separation_date;
  const doh = p.hire_date ?? "";

  // Length of service ("Xy Ym") — compute if DOH present.
  let los = "";
  if (doh) {
    const sep = new Date(sepDate);
    const d = new Date(doh);
    if (!isNaN(sep.getTime()) && !isNaN(d.getTime())) {
      let years = sep.getFullYear() - d.getFullYear();
      let months = sep.getMonth() - d.getMonth();
      if (sep.getDate() < d.getDate()) months -= 1;
      if (months < 0) {
        years -= 1;
        months += 12;
      }
      los = `${years}y ${months}m`;
    }
  }

  // Status code: sheet uses "D" for discharge/involuntary, "V" for voluntary.
  const type = (p.separation_type ?? "voluntary").toLowerCase();
  const statusCode = type === "involuntary" ? "D" : type === "voluntary" ? "V" : "U";

  // Eligible-for-rehire as a single Y/N/Cond value.
  const rehire =
    p.rehire_eligible === "yes"
      ? "Y"
      : p.rehire_eligible === "no"
        ? "N"
        : "Cond";

  return [
    formatNameForSheet(p.legal_name),
    formatDate(sepDate),
    formatDate(doh),
    los,
    rehire,
    statusCode,
    "", // Location — separations ingest doesn't track this today
    p.reason_primary ?? "",
    p.supervisor_name_raw ?? "",
    p.exit_interview_status === "completed" ? formatDate(sepDate) : "",
    p.position ?? "",
    p.hr_notes ?? "",
    p.department ?? "",
  ];
}

export async function runSeparationsWriteback(opts: {
  supabase: SupabaseClient;
  dryRun: boolean;
}): Promise<RunStats> {
  const { supabase, dryRun } = opts;
  const stats: RunStats = { pending: 0, applied: 0, skipped: 0, failed: 0, errors: [] };

  const wbPath = findWorkbookPath();
  if (!wbPath) {
    stats.errors.push(`Workbook not found in any of: ${DEFAULT_XLSX_PATHS.join(", ")}`);
    stats.failed = 1;
    return stats;
  }
  const wbDir = path.dirname(wbPath);

  const { data: rows, error } = await supabase
    .from("pending_xlsx_writes")
    .select("id, action, payload, created_at")
    .eq("source", "separation_summary")
    .is("applied_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    stats.errors.push(`pending fetch failed: ${error.message}`);
    stats.failed = 1;
    return stats;
  }
  stats.pending = rows?.length ?? 0;
  if (stats.pending === 0) {
    console.log("No pending separation writes. Nothing to do.");
    return stats;
  }

  console.log(`Opening ${wbPath}`);
  const release = acquireLock(wbDir);
  try {
    const wb = XLSX.readFile(wbPath, { cellDates: false, cellStyles: true });

    for (const row of rows ?? []) {
      const payload = row.payload as SeparationPayload;
      try {
        const fy = evcFiscalYear(payload.separation_date);
        const sheetName = findFYSheetName(wb, fy);
        if (!sheetName) {
          throw new Error(`No FY ${fy} tab found in workbook`);
        }
        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

        const block = findMonthBlock(aoa, monthUpper(payload.separation_date));
        if (!block) {
          throw new Error(
            `No ${monthUpper(payload.separation_date)} section in "${sheetName}"`,
          );
        }

        // Find the first empty row in the block (Name column empty).
        let targetIdx = -1;
        for (let i = block.headerIdx + 1; i <= block.lastDataIdx; i++) {
          const first = String(((aoa[i] ?? [])[0]) ?? "").trim();
          if (!first) {
            targetIdx = i;
            break;
          }
        }
        // If no empty row, append to the end of the block and shift later
        // blocks down by one. Simpler approach: write at lastDataIdx + 1 and
        // accept that subsequent months may get pushed. For now, error if
        // the block is full so the operator notices.
        if (targetIdx === -1) {
          throw new Error(
            `${monthUpper(payload.separation_date)} ${fy} block is full — add blank rows in the xlsx.`,
          );
        }

        const sheetRow = buildSheetRow(payload);

        if (dryRun) {
          console.log(
            `  [DRY] ${sheetName} row ${targetIdx + 1}: ${sheetRow[0]} — ${sheetRow[1]}`,
          );
          stats.skipped += 1;
          continue;
        }

        // Write the new row (A = col 1). Using sheet_add_aoa preserves other
        // cells' styling via { origin: ... }.
        XLSX.utils.sheet_add_aoa(ws, [sheetRow], { origin: targetIdx });

        stats.applied += 1;

        // Mark applied in Supabase (per-row, in case a later row throws we
        // don't lose credit for earlier ones).
        await supabase
          .from("pending_xlsx_writes")
          .update({
            applied_at: new Date().toISOString(),
            applied_by: `cli:${process.env.USER ?? "local"}`,
          })
          .eq("id", row.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [FAIL] ${payload.legal_name ?? "?"}: ${msg}`);
        stats.failed += 1;
        stats.errors.push(`${payload.legal_name ?? row.id}: ${msg}`);
        await supabase
          .from("pending_xlsx_writes")
          .update({ error: msg })
          .eq("id", row.id);
      }
    }

    if (stats.applied > 0 && !dryRun) {
      XLSX.writeFile(wb, wbPath, { bookType: "xlsx", cellStyles: true });
      console.log(`Wrote ${stats.applied} row(s) to ${wbPath}`);
    } else if (dryRun) {
      console.log("Dry run — workbook not written.");
    }
  } finally {
    release();
  }

  return stats;
}
