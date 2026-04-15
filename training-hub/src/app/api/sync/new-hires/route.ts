// ============================================================
// POST /api/sync/new-hires — batch push from the Monthly New Hire
// Tracker workbook.
// ============================================================
// Used by the PushNewHires VBA macro in
// `Monthly New Hire Tracker (1).xlsm`. For every new-hire / transfer
// row on the current monthly sheet that has a Name + Hire Date, the
// macro POSTs here. The endpoint:
//
//   1. Looks up any existing employee by (last_name, first_name)
//      case-insensitive.
//   2. If no match, INSERTs a new employees row with the given
//      hire_date, division, department, position, job_title.
//   3. If a match exists and is inactive, flips it back to active
//      via the reactivate path (keeps old training history attached).
//   4. If a match exists and is already active, updates any
//      empty-side fields (hire_date, division, department, position)
//      so the tracker can backfill missing detail without
//      overwriting operator-entered data.
//
// Auth: x-hub-sync-token header must match HUB_SYNC_TOKEN.
//
// Request body:
//   {
//     "new_hires": [
//       {
//         "last_name": "Doe",
//         "first_name": "Jane",
//         "hire_date": "2026-04-14",          // yyyy-mm-dd, required
//         "division": "Residential",          // optional (umbrella)
//         "department": "Tiffin",             // optional (sub-unit / home)
//         "position": "DSP",                  // optional
//         "job_title": "Direct Support Professional", // optional
//         "paylocity_id": "AB12",             // optional
//         "sheet": "April",                   // optional, for logs
//         "row_number": 12                    // optional, for logs
//       }
//     ]
//   }
//
// Response:
//   {
//     "results": [
//       {
//         "sheet", "row_number", "input",
//         "status": "created" | "updated" | "reactivated" | "unchanged" | "failed",
//         "employee_id": "<uuid>" | null,
//         "message": "optional detail"
//       }
//     ],
//     "summary": { "created": N, "updated": N, "reactivated": N, "unchanged": N, "failed": N }
//   }
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import {
  findEmployeeCandidatesByName,
  insertEmployee,
  updateEmployee,
  getEmployeeByPaylocityId,
} from "@/lib/db/employees";
import { buildNameAliases } from "@/lib/resolver/name-match";
import type { Employee, EmployeeUpdate } from "@/types/database";
import { upsertNewHireTrackerAuditFromSync } from "@/lib/db/trackers";

interface NewHireInput {
  last_name: string;
  first_name: string;
  hire_date: string;
  division: string | null;
  department: string | null;
  position: string | null;
  job_title: string | null;
  paylocity_id: string | null;
  sheet: string | null;
  row_number: number | null;
}

interface NewHireResult {
  sheet: string | null;
  row_number: number | null;
  input: {
    last_name: string;
    first_name: string;
    hire_date: string;
    division: string | null;
    department: string | null;
    position: string | null;
    paylocity_id: string | null;
  };
  status: "created" | "updated" | "reactivated" | "unchanged" | "ambiguous" | "failed";
  employee_id: string | null;
  message: string | null;
}

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function recordNewHireTrackerAuditIfAnchored(input: NewHireInput, result: NewHireResult) {
  if (!input.sheet || input.row_number == null || input.row_number < 1) return;
  await upsertNewHireTrackerAuditFromSync({
    sheet: input.sheet,
    row_number: input.row_number,
    last_name: input.last_name,
    first_name: input.first_name,
    hire_date: input.hire_date,
    paylocity_id: input.paylocity_id,
    division: input.division,
    department: input.department,
    position: input.position,
    job_title: input.job_title,
    employee_id: result.employee_id,
    hubSyncStatus: result.status,
    hubMessage: result.message,
  });
}

export const POST = withApiHandler(async (req) => {
  requireSyncToken(req);

  const body = (await req.json().catch(() => ({}))) as { new_hires?: unknown };
  if (!Array.isArray(body.new_hires)) {
    throw new ApiError("body.new_hires must be an array", 400, "invalid_field");
  }

  const inputs: NewHireInput[] = [];
  for (const raw of body.new_hires as unknown[]) {
    if (!raw || typeof raw !== "object") {
      throw new ApiError("new_hires[] entries must be objects", 400, "invalid_field");
    }
    const row = raw as Record<string, unknown>;
    const last_name = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const first_name = typeof row.first_name === "string" ? row.first_name.trim() : "";
    if (!last_name || !first_name) {
      throw new ApiError(
        "new_hires[].last_name and first_name are required",
        400,
        "missing_field"
      );
    }
    if (!isYmd(row.hire_date)) {
      throw new ApiError(
        "new_hires[].hire_date must be yyyy-mm-dd",
        400,
        "invalid_field"
      );
    }
    inputs.push({
      last_name,
      first_name,
      hire_date: row.hire_date,
      division: nullableString(row.division),
      department: nullableString(row.department),
      position: nullableString(row.position),
      job_title: nullableString(row.job_title),
      paylocity_id: nullableString(row.paylocity_id),
      sheet: nullableString(row.sheet),
      row_number: typeof row.row_number === "number" ? row.row_number : null,
    });
  }

  const results: NewHireResult[] = [];
  const summary = {
    created: 0,
    updated: 0,
    reactivated: 0,
    unchanged: 0,
    ambiguous: 0,
    failed: 0,
  };

  for (const input of inputs) {
    const base: Omit<NewHireResult, "status" | "employee_id" | "message"> = {
      sheet: input.sheet,
      row_number: input.row_number,
      input: {
        last_name: input.last_name,
        first_name: input.first_name,
        hire_date: input.hire_date,
        division: input.division,
        department: input.department,
        position: input.position,
        paylocity_id: input.paylocity_id,
      },
    };

    try {
      // 1. Prefer paylocity_id lookup if supplied.
      let existing: Employee | null = null;
      if (input.paylocity_id) {
        existing = await getEmployeeByPaylocityId(input.paylocity_id);
      }

      // 2. Fall back to case-insensitive name match.
      if (!existing) {
        const candidates = await findEmployeeCandidatesByName(
          input.last_name,
          input.first_name
        );
        if (candidates.length === 1) {
          existing = candidates[0];
        } else if (candidates.length > 1) {
          // Ambiguous — don't guess. Punt to the operator.
          summary.ambiguous += 1;
          const r: NewHireResult = {
            ...base,
            status: "ambiguous",
            employee_id: null,
            message: `${candidates.length} active/inactive employees match this name; resolve manually in /review`,
          };
          results.push(r);
          await recordNewHireTrackerAuditIfAnchored(input, r);
          continue;
        }
      }

      if (!existing) {
        // 3. Create a fresh row.
        const aliases = buildNameAliases({
          lastName: input.last_name,
          firstName: input.first_name,
        });
        const created = await insertEmployee({
          last_name: input.last_name,
          first_name: input.first_name,
          hire_date: input.hire_date,
          department: input.department,
          division: input.division,
          position: input.position,
          job_title: input.job_title,
          paylocity_id: input.paylocity_id,
          employee_number: input.paylocity_id,
          aliases,
          is_active: true,
        });
        summary.created += 1;
        const createdRes: NewHireResult = {
          ...base,
          status: "created",
          employee_id: created.id,
          message: null,
        };
        results.push(createdRes);
        await recordNewHireTrackerAuditIfAnchored(input, createdRes);
        continue;
      }

      // 4. Build a diff patch. Only fill empty-side fields so we don't
      //    clobber manual overrides in the hub.
      const patch: EmployeeUpdate = {};
      if (!existing.hire_date) patch.hire_date = input.hire_date;
      if (!existing.department && input.department) patch.department = input.department;
      if (!existing.division && input.division) patch.division = input.division;
      if (!existing.position && input.position) patch.position = input.position;
      if (!existing.job_title && input.job_title) patch.job_title = input.job_title;
      if (!existing.paylocity_id && input.paylocity_id) {
        patch.paylocity_id = input.paylocity_id;
        patch.employee_number = input.paylocity_id;
      }

      // 5. Inactive existing row: reactivate it. This preserves history.
      if (!existing.is_active) {
        patch.is_active = true;
        patch.terminated_at = null;
        patch.reactivated_at = new Date().toISOString();
        const updated = await updateEmployee(existing.id, patch);
        summary.reactivated += 1;
        const reactRes: NewHireResult = {
          ...base,
          status: "reactivated",
          employee_id: updated.id,
          message: "Existing inactive profile reactivated; training history preserved",
        };
        results.push(reactRes);
        await recordNewHireTrackerAuditIfAnchored(input, reactRes);
        continue;
      }

      // 6. Active row with empty-side gaps.
      if (Object.keys(patch).length > 0) {
        const updated = await updateEmployee(existing.id, patch);
        summary.updated += 1;
        const updRes: NewHireResult = {
          ...base,
          status: "updated",
          employee_id: updated.id,
          message: "Filled missing fields without overwriting operator data",
        };
        results.push(updRes);
        await recordNewHireTrackerAuditIfAnchored(input, updRes);
        continue;
      }

      summary.unchanged += 1;
      const sameRes: NewHireResult = {
        ...base,
        status: "unchanged",
        employee_id: existing.id,
        message: "Employee already exists with all fields populated",
      };
      results.push(sameRes);
      await recordNewHireTrackerAuditIfAnchored(input, sameRes);
    } catch (err) {
      summary.failed += 1;
      const failRes: NewHireResult = {
        ...base,
        status: "failed",
        employee_id: null,
        message: err instanceof Error ? err.message : "unknown error",
      };
      results.push(failRes);
      await recordNewHireTrackerAuditIfAnchored(input, failRes);
    }
  }

  return { results, summary };
});
