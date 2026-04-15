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
  match_type: "exact" | "partial" | "last_only" | null;
  message: string | null;
}

export interface SeparationRosterEmployee {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  terminated_at: string | null;
}

type Roster = SeparationRosterEmployee[];
type SeparationMatchType = "exact" | "partial" | "last_only";
type SeparationMatchOutcome =
  | { kind: "single"; employee: SeparationRosterEmployee; matchType: SeparationMatchType }
  | { kind: "ambiguous"; matchType: SeparationMatchType; candidates: SeparationRosterEmployee[] }
  | { kind: "none" };

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveCandidateMatch(
  candidates: SeparationRosterEmployee[],
  matchType: SeparationMatchType
): SeparationMatchOutcome {
  if (candidates.length === 0) return { kind: "none" };

  // Prefer the one active profile when exactly one is active.
  const active = candidates.filter((c) => c.is_active);
  if (active.length === 1) {
    return { kind: "single", employee: active[0], matchType };
  }

  // No unique active match; accept a single inactive profile.
  if (active.length === 0 && candidates.length === 1) {
    return { kind: "single", employee: candidates[0], matchType };
  }

  return { kind: "ambiguous", matchType, candidates };
}

export function resolveSeparationMatch(
  roster: Roster,
  lastName: string,
  firstName: string
): SeparationMatchOutcome {
  const last = normalize(lastName);
  const first = normalize(firstName);
  if (last.length === 0) return { kind: "none" };

  const exact = roster.filter((emp) => normalize(emp.last_name) === last && normalize(emp.first_name) === first);
  const exactOutcome = resolveCandidateMatch(exact, "exact");
  if (exactOutcome.kind !== "none") return exactOutcome;

  if (first.length > 0) {
    const partial = roster.filter((emp) => {
      if (normalize(emp.last_name) !== last) return false;
      const empFirst = normalize(emp.first_name);
      return empFirst.startsWith(first);
    });
    const partialOutcome = resolveCandidateMatch(partial, "partial");
    if (partialOutcome.kind !== "none") return partialOutcome;
  }

  const lastOnly = roster.filter((emp) => normalize(emp.last_name) === last);
  return resolveCandidateMatch(lastOnly, "last_only");
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
      .select("id, first_name, last_name, is_active, terminated_at")
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
      const nm: SeparationResult = {
        ...base,
        status: "no_match",
        employee_id: null,
        match_type: null,
        message: "No employee matched the given name",
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
        message: `${match.candidates.length} ${match.matchType} matches found (${activeCount} active, ${inactiveCount} inactive); resolve manually`,
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
