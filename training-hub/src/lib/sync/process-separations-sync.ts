// ============================================================
// Core logic for POST /api/sync/separations (and gated approval).
// ============================================================

import { createServerClient } from "@/lib/supabase";
import { updateEmployee } from "@/lib/db/employees";
import { upsertSeparationTrackerAuditFromSync } from "@/lib/db/trackers";
import type { Employee } from "@/types/database";
import { ApiError } from "@/lib/api-handler";

export interface SeparationInput {
  last_name: string;
  first_name: string;
  date_of_separation: string;
  sheet?: string | null;
  row_number?: number | null;
}

export interface SeparationResult {
  sheet: string | null;
  row_number: number | null;
  input: {
    last_name: string;
    first_name: string;
    date_of_separation: string;
  };
  status: "synced" | "no_match" | "ambiguous" | "already_inactive" | "failed";
  employee_id: string | null;
  match_type: "exact" | null;
  message: string | null;
}

export interface SeparationRosterEmployee {
  id: string;
  first_name: string;
  last_name: string;
  aliases: string[];
  is_active: boolean;
  terminated_at: string | null;
}

type Roster = SeparationRosterEmployee[];
type SeparationMatchOutcome =
  | { kind: "single"; employee: SeparationRosterEmployee; matchType: "exact" }
  | { kind: "ambiguous"; matchType: "exact"; candidates: SeparationRosterEmployee[] }
  | { kind: "none" };
interface SimilarNameCandidate {
  display: string;
  score: number;
}

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(aRaw: string, bRaw: string): number {
  const a = aRaw.trim();
  const b = bRaw.trim();
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function resolveCandidateMatch(
  candidates: SeparationRosterEmployee[]
): SeparationMatchOutcome {
  if (candidates.length === 0) return { kind: "none" };

  // Prefer the one active profile when exactly one is active.
  const active = candidates.filter((c) => c.is_active);
  if (active.length === 1) {
    return { kind: "single", employee: active[0], matchType: "exact" };
  }

  // No unique active match; accept a single inactive profile.
  if (active.length === 0 && candidates.length === 1) {
    return { kind: "single", employee: candidates[0], matchType: "exact" };
  }

  return { kind: "ambiguous", matchType: "exact", candidates };
}

function hasExactAliasFirstNameMatch(
  employee: SeparationRosterEmployee,
  normalizedLast: string,
  normalizedFirst: string
): boolean {
  if (!normalizedFirst) return false;
  const aliasTargets = new Set<string>([
    normalize(`${normalizedFirst} ${normalizedLast}`),
    normalize(`${normalizedLast}, ${normalizedFirst}`),
  ]);
  return (employee.aliases ?? []).some((alias) => aliasTargets.has(normalize(alias)));
}

export function resolveSeparationMatch(
  roster: Roster,
  lastName: string,
  firstName: string
): SeparationMatchOutcome {
  const last = normalize(lastName);
  const first = normalize(firstName);
  if (last.length === 0 || first.length === 0) return { kind: "none" };

  // Exact only: legal first-name match OR exact alias match for preferred first name.
  const exact = roster.filter((emp) => {
    if (normalize(emp.last_name) !== last) return false;
    return normalize(emp.first_name) === first || hasExactAliasFirstNameMatch(emp, last, first);
  });
  return resolveCandidateMatch(exact);
}

export function suggestSimilarSeparationNames(
  roster: Roster,
  lastName: string,
  firstName: string,
  maxSuggestions: number = 3
): string[] {
  const last = normalize(lastName);
  const first = normalize(firstName);
  if (!last || !first || maxSuggestions < 1) return [];

  const candidates: SimilarNameCandidate[] = [];
  const seen = new Set<string>();

  for (const emp of roster) {
    const empLast = normalize(emp.last_name);
    const empFirst = normalize(emp.first_name);
    if (!empLast || !empFirst) continue;

    const lastDist = levenshteinDistance(last, empLast);
    const firstDist = levenshteinDistance(first, empFirst);
    const firstPrefix =
      empFirst.startsWith(first) || first.startsWith(empFirst);

    // Suggest nearby names, but do not broaden actual sync matching.
    if (lastDist > 2) continue;
    if (!(firstDist <= 2 || firstPrefix)) continue;

    const display = `${emp.first_name} ${emp.last_name}`.trim();
    const dedupeKey = normalize(display);
    if (!display || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const score = lastDist * 10 + Math.min(firstDist, 3) * 3 + (emp.is_active ? 0 : 1);
    candidates.push({ display, score });
  }

  candidates.sort((a, b) => a.score - b.score || a.display.localeCompare(b.display));
  return candidates.slice(0, maxSuggestions).map((c) => c.display);
}

async function recordSeparationTrackerAuditIfAnchored(input: SeparationInput, result: SeparationResult) {
  if (!input.sheet || input.row_number == null || input.row_number < 1) return;
  const noteParts = [result.match_type && `match=${result.match_type}`, result.message].filter(Boolean);
  const notes = noteParts.length > 0 ? noteParts.join(" · ").slice(0, 4000) : null;
  await upsertSeparationTrackerAuditFromSync({
    fy_sheet: input.sheet,
    row_number: input.row_number,
    last_name: input.last_name,
    first_name: input.first_name,
    date_of_separation: input.date_of_separation,
    employee_id: result.employee_id,
    sync_status: result.status,
    notes,
  });
}

export function parseSeparationSyncPayload(body: unknown): SeparationInput[] {
  const b = body as { separations?: unknown };
  if (!Array.isArray(b.separations)) {
    throw new ApiError("body.separations must be an array", 400, "invalid_field");
  }
  const inputs: SeparationInput[] = [];
  for (const raw of b.separations as unknown[]) {
    if (!raw || typeof raw !== "object") {
      throw new ApiError("separations[] entries must be objects", 400, "invalid_field");
    }
    const row = raw as Record<string, unknown>;
    const last_name = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const first_name = typeof row.first_name === "string" ? row.first_name.trim() : "";
    const date_of_separation = row.date_of_separation;
    if (!last_name) {
      throw new ApiError("separations[].last_name is required", 400, "missing_field");
    }
    if (!isYmd(date_of_separation)) {
      throw new ApiError("separations[].date_of_separation must be yyyy-mm-dd", 400, "invalid_field");
    }
    inputs.push({
      last_name,
      first_name,
      date_of_separation,
      sheet: typeof row.sheet === "string" ? row.sheet : null,
      row_number: typeof row.row_number === "number" ? row.row_number : null,
    });
  }
  return inputs;
}

async function loadRoster(): Promise<Roster> {
  const db = createServerClient();
  const roster: Roster = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("employees")
      .select("id, first_name, last_name, aliases, is_active, terminated_at")
      .range(offset, offset + PAGE - 1);
    if (error) {
      throw new ApiError(`failed to read roster: ${error.message}`, 500, "internal");
    }
    if (!data || data.length === 0) break;
    roster.push(...(data as Roster));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return roster;
}

export async function processSeparationSyncBatch(inputs: SeparationInput[]): Promise<{
  results: SeparationResult[];
  summary: {
    synced: number;
    already_inactive: number;
    no_match: number;
    ambiguous: number;
    failed: number;
  };
}> {
  const roster = await loadRoster();
  const results: SeparationResult[] = [];
  const summary = {
    synced: 0,
    already_inactive: 0,
    no_match: 0,
    ambiguous: 0,
    failed: 0,
  };

  for (const input of inputs) {
    const match = resolveSeparationMatch(roster, input.last_name, input.first_name);
    const base: Omit<SeparationResult, "status" | "employee_id" | "match_type" | "message"> = {
      sheet: input.sheet ?? null,
      row_number: input.row_number ?? null,
      input: {
        last_name: input.last_name,
        first_name: input.first_name,
        date_of_separation: input.date_of_separation,
      },
    };

    if (match.kind === "none") {
      summary.no_match += 1;
      const suggestions = suggestSimilarSeparationNames(
        roster,
        input.last_name,
        input.first_name
      );
      const suggestionText =
        suggestions.length > 0 ? ` Suggested similar names: ${suggestions.join("; ")}` : "";
      const nm: SeparationResult = {
        ...base,
        status: "no_match",
        employee_id: null,
        match_type: null,
        message: `No exact first/last (or preferred-name alias) match found.${suggestionText}`,
      };
      results.push(nm);
      await recordSeparationTrackerAuditIfAnchored(input, nm);
      continue;
    }

    if (match.kind === "ambiguous") {
      summary.ambiguous += 1;
      const activeCount = match.candidates.filter((c) => c.is_active).length;
      const inactiveCount = match.candidates.length - activeCount;
      const amb: SeparationResult = {
        ...base,
        status: "ambiguous",
        employee_id: null,
        match_type: match.matchType,
        message: `${match.candidates.length} exact-name matches found (${activeCount} active, ${inactiveCount} inactive); resolve manually`,
      };
      results.push(amb);
      await recordSeparationTrackerAuditIfAnchored(input, amb);
      continue;
    }

    const emp = match.employee;
    if (!emp.is_active) {
      summary.already_inactive += 1;
      const ai: SeparationResult = {
        ...base,
        status: "already_inactive",
        employee_id: emp.id,
        match_type: match.matchType,
        message: "Employee was already inactive; nothing to do",
      };
      results.push(ai);
      await recordSeparationTrackerAuditIfAnchored(input, ai);
      continue;
    }

    try {
      const updated = (await updateEmployee(emp.id, {
        is_active: false,
        terminated_at: new Date(`${input.date_of_separation}T00:00:00Z`).toISOString(),
      })) as Employee;
      summary.synced += 1;
      const ok: SeparationResult = {
        ...base,
        status: "synced",
        employee_id: updated.id,
        match_type: match.matchType,
        message: null,
      };
      results.push(ok);
      await recordSeparationTrackerAuditIfAnchored(input, ok);
    } catch (err) {
      summary.failed += 1;
      const fl: SeparationResult = {
        ...base,
        status: "failed",
        employee_id: emp.id,
        match_type: match.matchType,
        message: err instanceof Error ? err.message : "unknown error",
      };
      results.push(fl);
      await recordSeparationTrackerAuditIfAnchored(input, fl);
    }
  }

  return { results, summary };
}
