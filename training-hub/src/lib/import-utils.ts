// @ts-nocheck -- Legacy file slated for deletion. Replaced by
// src/lib/resolver/. Kept temporarily for any legacy API routes still
// referencing it.
import { createServerClient } from "./supabase";
import { namesMatch } from "./name-utils";
import { AUTO_FILL_RULES } from "@/config/trainings";

// ============================================================
// Shared import/sync utilities for Paylocity, PHS, etc.
// ============================================================

export function normalizeDate(val: string): string {
  const s = val.trim();
  // M/D/YY → M/D/YYYY
  const short = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (short) {
    let yr = parseInt(short[3]);
    yr += yr < 50 ? 2000 : 1900;
    return `${parseInt(short[1])}/${parseInt(short[2])}/${yr}`;
  }
  // M/D/YYYY — strip leading zeros
  const full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) return `${parseInt(full[1])}/${parseInt(full[2])}/${full[3]}`;
  // MM-DD-YY or MM-DD-YYYY (dashes)
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dash) {
    let yr = parseInt(dash[3]);
    if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    return `${parseInt(dash[1])}/${parseInt(dash[2])}/${yr}`;
  }
  // YYYY-MM-DD (ISO format from Supabase)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${parseInt(iso[2])}/${parseInt(iso[3])}/${iso[1]}`;
  }
  // Try Date parse
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) {
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
  } catch {}
  return s;
}

export function parseToTimestamp(dateStr: string): number {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])).getTime();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function datesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = parseToTimestamp(a);
  const tb = parseToTimestamp(b);
  if (ta && tb) return ta === tb;
  return false;
}

export interface FixEntry {
  employee: string;
  training: string;
  date: string;
}

// Columns that must always stay in sync with each other.
// Derived from AUTO_FILL_RULES (same-day mirrors only, offsetDays === 0).
const LINKED_COLUMNS: Record<string, string[]> = (() => {
  const result: Record<string, string[]> = {};
  for (const rule of AUTO_FILL_RULES) {
    if (rule.offsetDays === 0) {
      if (!result[rule.source]) result[rule.source] = [];
      result[rule.source].push(rule.target);
    }
  }
  return result;
})();

/**
 * Convert M/D/YYYY date string to ISO date (YYYY-MM-DD) for Supabase.
 */
function toISODate(dateStr: string): string | null {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Batch-write fixes to Supabase training_records.
 * Finds each employee and training type, then upserts the record.
 */
export async function applyFixesToSupabase(
  supabase: ReturnType<typeof createServerClient>,
  fixes: FixEntry[]
): Promise<{ matched: number; errors: string[] }> {
  // Fetch employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("is_active", true);

  if (!employees || employees.length === 0) {
    return { matched: 0, errors: ["No active employees found"] };
  }

  // Fetch training types
  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, column_key");

  const colKeyToTypeId = new Map<string, string>();
  for (const tt of trainingTypes || []) {
    colKeyToTypeId.set(tt.column_key.toUpperCase(), tt.id);
  }

  // Expand fixes to include linked columns (e.g. CPR ↔ FIRSTAID)
  const expanded: FixEntry[] = [];
  const seen = new Set<string>();
  for (const fix of fixes) {
    const key = `${fix.employee.toLowerCase()}|${fix.training.toUpperCase()}`;
    if (!seen.has(key)) { seen.add(key); expanded.push(fix); }
    for (const linked of LINKED_COLUMNS[fix.training.toUpperCase()] || []) {
      const lKey = `${fix.employee.toLowerCase()}|${linked}`;
      if (!seen.has(lKey)) {
        seen.add(lKey);
        expanded.push({ employee: fix.employee, training: linked, date: fix.date });
      }
    }
  }

  let matched = 0;
  const errors: string[] = [];

  for (const fix of expanded) {
    const typeId = colKeyToTypeId.get(fix.training.toUpperCase());
    if (!typeId) {
      errors.push(`Training type "${fix.training}" not found`);
      continue;
    }

    // Find employee by name
    const emp = employees.find((e: any) => {
      const last = (e.last_name || "").trim();
      const first = (e.first_name || "").trim();
      const combined = first ? `${last}, ${first}` : last;
      return namesMatch(combined, fix.employee);
    });

    if (!emp) {
      errors.push(`Employee "${fix.employee}" not found`);
      continue;
    }

    const isoDate = toISODate(fix.date);
    if (!isoDate) {
      errors.push(`Invalid date "${fix.date}" for ${fix.employee}`);
      continue;
    }

    // Upsert training record
    const { error: upsertError } = await supabase
      .from("training_records")
      .upsert(
        {
          employee_id: emp.id,
          training_type_id: typeId,
          completion_date: isoDate,
          source: "sync",
        },
        { onConflict: "employee_id,training_type_id" }
      );

    if (upsertError) {
      errors.push(`Failed to update ${fix.employee} / ${fix.training}: ${upsertError.message}`);
      continue;
    }

    // Remove any NA excusal if it exists
    await supabase
      .from("excusals")
      .delete()
      .eq("employee_id", emp.id)
      .eq("training_type_id", typeId);

    matched++;
  }

  return { matched, errors };
}

/**
 * Load name mappings from Supabase hub_settings.
 * Returns a Map of lowercase source name → training sheet name.
 */
export async function loadNameMappingsFromSupabase(
  supabase: ReturnType<typeof createServerClient>
): Promise<Map<string, string>> {
  const { data: settings } = await supabase
    .from("hub_settings")
    .select("key, value")
    .eq("type", "name_map");

  const mappings = new Map<string, string>();
  for (const s of settings || []) {
    const sourceName = (s.key || "").trim().toLowerCase();
    const targetName = (s.value || "").trim();
    if (sourceName && targetName) mappings.set(sourceName, targetName);
  }
  return mappings;
}

