// ============================================================
// POST /api/sync/separations — batch push from FY Separation Summary
// ============================================================
// The HubSync VBA macro in `FY Separation Summary.xlsm` used to hit
// PostgREST's /rest/v1/employees directly with the anon key. That
// stopped working after migration 20260412120100_rls_defense_in_depth
// enabled RLS on the employees table with no anon policies. This
// endpoint replaces that direct path.
//
// Auth: x-hub-sync-token header must match HUB_SYNC_TOKEN env var.
//       The token lives in the macro's .bas source; rotation is a
//       single env-var change on Vercel plus a single string update
//       in the .bas file. The Supabase service-role key is never
//       embedded in the workbook.
//
// Request body:
//   {
//     "separations": [
//       {
//         "last_name": "Smith",
//         "first_name": "Jane",
//         "date_of_separation": "2026-04-01",
//         "sheet": "FY 2026 (Jan26-Dec26)",     // optional, for logs
//         "row_number": 37                      // optional, for logs
//       },
//       ...
//     ]
//   }
//
// Response:
//   {
//     "results": [
//       {
//         "sheet": "FY 2026 (Jan26-Dec26)",
//         "row_number": 37,
//         "input": { "last_name": "Smith", "first_name": "Jane", "date_of_separation": "2026-04-01" },
//         "status": "synced" | "no_match" | "ambiguous" | "already_inactive" | "failed",
//         "employee_id": "<uuid>" | null,
//         "match_type": "exact" | "partial" | "last_only" | null,
//         "message": "optional human-readable detail"
//       }
//     ],
//     "summary": { "synced": N, "already_inactive": N, "no_match": N, "ambiguous": N, "failed": N }
//   }
//
// Behavior per row:
//   1. Look up a single active employee by (last_name, first_name).
//      Fall back to (last, first-prefix) then last-name-only if unique.
//   2. If already inactive → return "already_inactive" without writing.
//   3. Otherwise, terminate via db/employees.updateEmployee with
//      is_active=false and terminated_at = date_of_separation (as
//      yyyy-mm-dd ISO timestamp).
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import { createServerClient } from "@/lib/supabase";
import { updateEmployee } from "@/lib/db/employees";
import { upsertSeparationTrackerAuditFromSync } from "@/lib/db/trackers";
import type { Employee } from "@/types/database";

interface SeparationInput {
  last_name: string;
  first_name: string;
  date_of_separation: string; // yyyy-mm-dd
  sheet?: string | null;
  row_number?: number | null;
}

interface SeparationResult {
  sheet: string | null;
  row_number: number | null;
  input: {
    last_name: string;
    first_name: string;
    date_of_separation: string;
  };
  status:
    | "synced"
    | "no_match"
    | "ambiguous"
    | "already_inactive"
    | "failed";
  employee_id: string | null;
  match_type: "exact" | "partial" | "last_only" | null;
  message: string | null;
}

type ActiveRoster = { id: string; first_name: string; last_name: string; is_active: boolean; terminated_at: string | null }[];

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function findMatch(
  roster: ActiveRoster,
  lastName: string,
  firstName: string
): { employee: ActiveRoster[number]; matchType: "exact" | "partial" | "last_only" } | null {
  const last = lastName.trim().toLowerCase();
  const first = firstName.trim().toLowerCase();
  if (last.length === 0) return null;

  // 1. exact last + exact first
  for (const emp of roster) {
    if (emp.last_name.toLowerCase() === last && emp.first_name.toLowerCase() === first) {
      return { employee: emp, matchType: "exact" };
    }
  }

  // 2. exact last + first-name-prefix (matches "Heather" ⇄ "Heather M.")
  if (first.length > 0) {
    for (const emp of roster) {
      const empFirst = emp.first_name.toLowerCase();
      if (emp.last_name.toLowerCase() === last && empFirst.startsWith(first)) {
        return { employee: emp, matchType: "partial" };
      }
    }
  }

  // 3. exact last only, if unique in the roster
  const lastOnly = roster.filter((emp) => emp.last_name.toLowerCase() === last);
  if (lastOnly.length === 1) {
    return { employee: lastOnly[0], matchType: "last_only" };
  }

  return null;
}

async function recordSeparationTrackerAuditIfAnchored(
  input: SeparationInput,
  result: SeparationResult
) {
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

export const POST = withApiHandler(async (req) => {
  requireSyncToken(req);

  const body = (await req.json().catch(() => ({}))) as {
    separations?: unknown;
  };

  if (!Array.isArray(body.separations)) {
    throw new ApiError("body.separations must be an array", 400, "invalid_field");
  }

  const inputs: SeparationInput[] = [];
  for (const raw of body.separations as unknown[]) {
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
      throw new ApiError(
        "separations[].date_of_separation must be yyyy-mm-dd",
        400,
        "invalid_field"
      );
    }
    inputs.push({
      last_name,
      first_name,
      date_of_separation,
      sheet: typeof row.sheet === "string" ? row.sheet : null,
      row_number: typeof row.row_number === "number" ? row.row_number : null,
    });
  }

  // Fetch active roster once for name matching.
  const db = createServerClient();
  const roster: ActiveRoster = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("employees")
      .select("id, first_name, last_name, is_active, terminated_at")
      .eq("is_active", true)
      .range(offset, offset + PAGE - 1);
    if (error) {
      throw new ApiError(`failed to read roster: ${error.message}`, 500, "internal");
    }
    if (!data || data.length === 0) break;
    roster.push(...(data as ActiveRoster));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const results: SeparationResult[] = [];
  const summary = {
    synced: 0,
    already_inactive: 0,
    no_match: 0,
    ambiguous: 0,
    failed: 0,
  };

  for (const input of inputs) {
    const match = findMatch(roster, input.last_name, input.first_name);
    const base: Omit<SeparationResult, "status" | "employee_id" | "match_type" | "message"> = {
      sheet: input.sheet ?? null,
      row_number: input.row_number ?? null,
      input: {
        last_name: input.last_name,
        first_name: input.first_name,
        date_of_separation: input.date_of_separation,
      },
    };

    if (!match) {
      summary.no_match += 1;
      const nm: SeparationResult = {
        ...base,
        status: "no_match",
        employee_id: null,
        match_type: null,
        message: "No active employee matched the given name",
      };
      results.push(nm);
      await recordSeparationTrackerAuditIfAnchored(input, nm);
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
});
