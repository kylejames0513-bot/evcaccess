/**
 * Source A — Merged Employee Master (Google Sheet, live CSV)
 *
 * Published CSV from the EVC Merged Employee Master Google Sheet.
 * This is both the initial seed AND the ongoing authoritative refresh.
 *
 * Column detection: reads header row, normalizes, matches against alias list.
 * Upserts to employees on employee_id conflict.
 * Two-pass: first inserts/updates all rows, second resolves supervisor_id FKs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { parseDate, toISODate, parseEmployeeStatus, normalizeName } from "../normalize";
import { createIngestionRun, finishIngestionRun, writeAuditEntry, type RunStats } from "../runLogger";

/** Flexible column header aliases → canonical field name */
const COLUMN_ALIASES: Record<string, string[]> = {
  employee_id: ["employee id", "paylocity id", "ee id", "id", "emp id", "employee_id"],
  legal_last_name: ["last name", "legal last", "l name", "last", "lastname", "legal_last_name"],
  legal_first_name: ["first name", "legal first", "f name", "first", "firstname", "legal_first_name"],
  preferred_name: ["preferred name", "nickname", "preferred", "pref name", "preferred_name"],
  known_aliases: ["known aliases", "aliases", "alias", "known_aliases"],
  position: ["position", "position title", "job title"],
  department: ["department", "dept", "department description"],
  location: ["location", "division", "division description", "site"],
  supervisor_name: ["supervisor", "supervisor name", "manager", "supervisor_name"],
  supervisor_id_raw: ["supervisor id", "supervisor_employee_id", "mgr id"],
  status: ["status", "active", "employment status"],
  hire_date: ["hire date", "doh", "date of hire", "hire_date", "start date"],
  termination_date: ["termination date", "dot", "date of term", "term date", "termination_date", "separation date"],
  email: ["email", "email address", "work email"],
  phone: ["phone", "phone number", "mobile", "cell"],
};

function detectColumns(headers: string[]): Map<string, number> {
  const mapping = new Map<string, number>();
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ""));

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.some((a) => normalizedHeaders[i] === a)) {
        mapping.set(canonical, i);
        break;
      }
    }
  }

  return mapping;
}

function getVal(row: string[], colMap: Map<string, number>, field: string): string {
  const idx = colMap.get(field);
  if (idx === undefined || idx >= row.length) return "";
  return (row[idx] ?? "").trim();
}

export async function ingest(options: {
  url?: string;
  filepath?: string;
  mode: "seed" | "refresh" | "verify";
  dryRun: boolean;
  supabase: SupabaseClient;
}): Promise<RunStats> {
  const { supabase, mode, dryRun } = options;
  const stats: RunStats = { processed: 0, inserted: 0, updated: 0, skipped: 0, unresolved: 0, errors: [] };

  const csvUrl = options.url ?? process.env.MERGED_MASTER_CSV_URL;
  if (!csvUrl) {
    stats.errors.push("MERGED_MASTER_CSV_URL not set and no URL provided");
    return stats;
  }

  const runId = dryRun ? "dry-run" : await createIngestionRun(supabase, "merged_master", mode === "seed" ? "seed" : "cron");

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
  if (!parsed.data.length) {
    stats.errors.push("CSV is empty");
    if (!dryRun) await finishIngestionRun(supabase, runId, stats);
    return stats;
  }

  const headerRow = parsed.data[0];
  const colMap = detectColumns(headerRow);
  const dataRows = parsed.data.slice(1);

  // Check required columns
  if (!colMap.has("employee_id")) {
    stats.errors.push("Missing employee_id column. Found headers: " + headerRow.join(", "));
    if (!dryRun) await finishIngestionRun(supabase, runId, stats);
    return stats;
  }

  console.log(`[employeeMaster] Detected columns: ${[...colMap.entries()].map(([k, v]) => `${k}=${headerRow[v]}`).join(", ")}`);
  console.log(`[employeeMaster] Processing ${dataRows.length} rows...`);

  // Pass 1: Upsert all employees
  const supervisorQueue: { employeeId: string; supervisorNameRaw: string; supervisorIdRaw: string }[] = [];

  for (const row of dataRows) {
    stats.processed++;
    const employeeId = getVal(row, colMap, "employee_id");
    if (!employeeId) { stats.skipped++; continue; }

    const lastName = getVal(row, colMap, "legal_last_name");
    const firstName = getVal(row, colMap, "legal_first_name");
    if (!lastName && !firstName) { stats.skipped++; continue; }

    const hireDateRaw = getVal(row, colMap, "hire_date");
    const hireDate = parseDate(hireDateRaw);
    const termDateRaw = getVal(row, colMap, "termination_date");
    const termDate = parseDate(termDateRaw);
    const statusRaw = getVal(row, colMap, "status");
    const status = parseEmployeeStatus(statusRaw);

    const aliasesRaw = getVal(row, colMap, "known_aliases");
    const knownAliases = aliasesRaw
      ? aliasesRaw.split(/[;,]/).map((a) => a.trim()).filter(Boolean)
      : [];

    const supervisorName = getVal(row, colMap, "supervisor_name");
    const supervisorIdRaw = getVal(row, colMap, "supervisor_id_raw");

    const record = {
      employee_id: employeeId,
      legal_last_name: lastName,
      legal_first_name: firstName,
      preferred_name: getVal(row, colMap, "preferred_name") || null,
      known_aliases: knownAliases,
      email: getVal(row, colMap, "email") || null,
      phone: getVal(row, colMap, "phone") || null,
      position: getVal(row, colMap, "position") || null,
      department: getVal(row, colMap, "department") || null,
      location: getVal(row, colMap, "location") || null,
      supervisor_name_raw: supervisorName || null,
      status: status === "unknown" ? "active" : status,
      hire_date: hireDate ? toISODate(hireDate) : null,
      termination_date: termDate ? toISODate(termDate) : null,
      source: "merged_master",
    };

    if (dryRun) {
      console.log(`  [DRY] Would upsert: ${firstName} ${lastName} (${employeeId})`);
      stats.inserted++;
      continue;
    }

    // Upsert on employee_id
    const { data: existing } = await supabase
      .from("employees")
      .select("id, legal_last_name, legal_first_name, status")
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("employees")
        .update(record)
        .eq("employee_id", employeeId);
      if (error) {
        stats.errors.push(`Update failed for ${employeeId}: ${error.message}`);
      } else {
        stats.updated++;
        await writeAuditEntry(supabase, {
          actor: "system",
          action: "update",
          entity_type: "employee",
          entity_id: existing.id,
          before: { legal_last_name: existing.legal_last_name, legal_first_name: existing.legal_first_name, status: existing.status },
          after: { legal_last_name: lastName, legal_first_name: firstName, status: record.status },
          source: "merged_master",
        });
      }
    } else {
      const { error } = await supabase
        .from("employees")
        .insert(record);
      if (error) {
        stats.errors.push(`Insert failed for ${employeeId}: ${error.message}`);
      } else {
        stats.inserted++;
      }
    }

    if (supervisorName || supervisorIdRaw) {
      supervisorQueue.push({ employeeId, supervisorNameRaw: supervisorName, supervisorIdRaw });
    }
  }

  // Pass 2: Resolve supervisor foreign keys
  if (!dryRun && supervisorQueue.length > 0) {
    console.log(`[employeeMaster] Pass 2: resolving ${supervisorQueue.length} supervisor links...`);
    for (const { employeeId, supervisorNameRaw, supervisorIdRaw } of supervisorQueue) {
      let supervisorDbId: string | null = null;

      // Try by employee_id first
      if (supervisorIdRaw) {
        const { data } = await supabase
          .from("employees")
          .select("id")
          .eq("employee_id", supervisorIdRaw)
          .maybeSingle();
        if (data) supervisorDbId = data.id;
      }

      // Fall back to name match
      if (!supervisorDbId && supervisorNameRaw) {
        const parts = supervisorNameRaw.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 2) {
          const { data } = await supabase
            .from("employees")
            .select("id")
            .ilike("legal_last_name", parts[0])
            .ilike("legal_first_name", `${parts[parts.length - 1]}%`)
            .maybeSingle();
          if (data) supervisorDbId = data.id;
        }
      }

      if (supervisorDbId) {
        await supabase
          .from("employees")
          .update({ supervisor_id: supervisorDbId })
          .eq("employee_id", employeeId);
      }
    }
  }

  console.log(`[employeeMaster] Done: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors.length} errors`);
  if (!dryRun) await finishIngestionRun(supabase, runId, stats);
  return stats;
}
