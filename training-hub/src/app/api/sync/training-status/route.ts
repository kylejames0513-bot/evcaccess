// ============================================================
// POST /api/sync/training-status — batch pull for the Monthly
// New Hire Tracker's SyncFromSupabase macro.
// ============================================================
// Replaces the macro's old direct call to
//   /rest/v1/employee_compliance?select=...
// which stopped working when RLS was enabled without anon policies
// (migration 20260412120100_rls_defense_in_depth).
//
// The macro sends the active roster of names from the current
// monthly sheet and gets back a map of (name → training statuses)
// so it can fill CPR/FA, Med Cert, Ukeru, and Mealtime cells.
//
// Auth: x-hub-sync-token header must match HUB_SYNC_TOKEN.
//
// Request body (both fields optional — at least one must be set):
//   {
//     "names": [
//       { "last_name": "Smith", "first_name": "Jane" }
//     ],
//     "trainings": ["CPR", "CPR/FA", "Mealtime", "Ukeru", "MED_TRAIN"]
//   }
//
// If `names` is omitted, the endpoint returns the whole active
// roster — useful for initial bulk sync.
// If `trainings` is omitted, every training_type column_key is
// returned for each employee.
//
// Response shape:
//   {
//     "employees": [
//       {
//         "last_name": "Smith",
//         "first_name": "Jane",
//         "employee_id": "<uuid>",
//         "hire_date": "2024-03-01",
//         "division": "Residential",
//         "department": "Tiffin",
//         "position": "DSP",
//         "trainings": [
//           {
//             "training_type_id": 1,
//             "training_name": "CPR/FA",
//             "column_key": "CPR",
//             "completion_date": "2025-09-12",
//             "expiration_date": "2027-09-12",
//             "status": "current",            // current | expired | expiring_soon | needed | excused
//             "excusal_reason": null,
//             "completion_source": "phs"
//           }
//         ]
//       }
//     ]
//   }
//
// The macro is allowed to match by `column_key` OR `training_name`
// (the existing macro matches on name). Both are returned so
// either lookup works.
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import { createServerClient } from "@/lib/supabase";
import { listCompliance, fixSharedColumnKeyCompliance } from "@/lib/db/compliance";

interface NameQuery {
  last_name: string;
  first_name: string;
}

interface EmployeeOut {
  last_name: string;
  first_name: string;
  employee_id: string;
  hire_date: string | null;
  division: string | null;
  department: string | null;
  position: string | null;
  trainings: {
    training_type_id: number | null;
    training_name: string | null;
    column_key: string | null;
    completion_date: string | null;
    expiration_date: string | null;
    status: string | null;
    excusal_reason: string | null;
    completion_source: string | null;
  }[];
}

export const POST = withApiHandler(async (req) => {
  requireSyncToken(req);

  const body = (await req.json().catch(() => ({}))) as {
    names?: unknown;
    trainings?: unknown;
  };

  let names: NameQuery[] | null = null;
  if (Array.isArray(body.names)) {
    names = [];
    for (const raw of body.names as unknown[]) {
      if (!raw || typeof raw !== "object") {
        throw new ApiError("names[] entries must be objects", 400, "invalid_field");
      }
      const row = raw as Record<string, unknown>;
      const last_name = typeof row.last_name === "string" ? row.last_name.trim() : "";
      const first_name = typeof row.first_name === "string" ? row.first_name.trim() : "";
      if (!last_name) {
        throw new ApiError("names[].last_name is required", 400, "missing_field");
      }
      names.push({ last_name, first_name });
    }
  }

  let trainingFilter: Set<string> | null = null;
  if (Array.isArray(body.trainings)) {
    trainingFilter = new Set(
      (body.trainings as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.toLowerCase().trim())
        .filter((x) => x.length > 0)
    );
    if (trainingFilter.size === 0) trainingFilter = null;
  }

  // Pull the raw compliance rows from the view, then apply the shared
  // column_key fix so Initial Med ↔ Med Recert behave correctly.
  const rawCompliance = await listCompliance();
  const compliance = await fixSharedColumnKeyCompliance(rawCompliance);

  // Pull the column_key mapping so the caller can match by column_key.
  const db = createServerClient();
  const { data: ttRows, error: ttErr } = await db
    .from("training_types")
    .select("id, name, column_key")
    .eq("is_active", true);
  if (ttErr) {
    throw new ApiError(`failed to read training_types: ${ttErr.message}`, 500, "internal");
  }
  const columnKeyById = new Map<number, string>();
  const nameById = new Map<number, string>();
  for (const tt of ttRows ?? []) {
    columnKeyById.set(tt.id, tt.column_key);
    nameById.set(tt.id, tt.name);
  }

  // Build a per-employee rollup.
  const byEmployee = new Map<string, EmployeeOut>();
  for (const row of compliance) {
    if (!row.employee_id) continue;
    const columnKey = row.training_type_id != null ? columnKeyById.get(row.training_type_id) ?? null : null;
    const trainingName = row.training_name ?? (row.training_type_id != null ? nameById.get(row.training_type_id) ?? null : null);

    if (trainingFilter) {
      const nameLc = trainingName ? trainingName.toLowerCase() : "";
      const colLc = columnKey ? columnKey.toLowerCase() : "";
      if (!trainingFilter.has(nameLc) && !trainingFilter.has(colLc)) {
        continue;
      }
    }

    let entry = byEmployee.get(row.employee_id);
    if (!entry) {
      entry = {
        last_name: row.last_name ?? "",
        first_name: row.first_name ?? "",
        employee_id: row.employee_id,
        hire_date: null,
        division: row.division ?? null,
        department: row.department ?? null,
        position: row.position ?? null,
        trainings: [],
      };
      byEmployee.set(row.employee_id, entry);
    }
    entry.trainings.push({
      training_type_id: row.training_type_id ?? null,
      training_name: trainingName,
      column_key: columnKey,
      completion_date: row.completion_date ?? null,
      expiration_date: row.expiration_date ?? null,
      status: row.status ?? null,
      excusal_reason: row.excusal_reason ?? null,
      completion_source: row.completion_source ?? null,
    });
  }

  // Backfill hire_date from the employees table in one query.
  const empIds = [...byEmployee.keys()];
  if (empIds.length > 0) {
    const { data: hireRows, error: hireErr } = await db
      .from("employees")
      .select("id, hire_date")
      .in("id", empIds);
    if (hireErr) {
      throw new ApiError(`failed to read hire dates: ${hireErr.message}`, 500, "internal");
    }
    for (const row of hireRows ?? []) {
      const entry = byEmployee.get(row.id);
      if (entry) entry.hire_date = row.hire_date;
    }
  }

  // Optional name filter: only return rows whose (last, first) matches
  // something in the request's names[] list.
  let out: EmployeeOut[];
  if (names) {
    const wanted = new Set(
      names.map((n) => `${n.last_name.toLowerCase()}|${n.first_name.toLowerCase()}`)
    );
    out = [];
    for (const entry of byEmployee.values()) {
      const key = `${entry.last_name.toLowerCase()}|${entry.first_name.toLowerCase()}`;
      if (wanted.has(key)) out.push(entry);
    }
  } else {
    out = [...byEmployee.values()];
  }

  out.sort((a, b) => {
    const l = a.last_name.localeCompare(b.last_name);
    if (l !== 0) return l;
    return a.first_name.localeCompare(b.first_name);
  });

  return { employees: out };
});
