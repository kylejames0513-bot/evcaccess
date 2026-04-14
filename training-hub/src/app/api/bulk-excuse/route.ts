import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { dropEnrollmentsForExcusedPairs } from "@/lib/db/excusals";

/**
 * POST /api/bulk-excuse
 * Body: {
 *   division?: string,           // excuse all active employees in this division
 *   position?: string,           // optional — narrow a division excuse to a single position
 *   employeeNames?: string[],    // OR excuse these specific employees by "First Last" name
 *   trainingColumnKeys: string[], // column_key values to excuse (e.g. ["CPR", "MED_TRAIN"])
 *   reason: string,              // excusal reason code (e.g. "NA", "DIR", "RN")
 * }
 *
 * Creates excusals for every (employee, training_type) pair. Uses upsert
 * with ON CONFLICT so re-running is safe. Works for ALL trainings including
 * universal ones like CPR — the compliance view checks excusals first
 * regardless of how the requirement was created.
 */
export const POST = withApiHandler(async (req) => {
  const body = await req.json();
    const {
      division,
      position,
      employeeNames,
      trainingColumnKeys,
      reason,
    } = body as {
      division?: string;
      position?: string;
      employeeNames?: string[];
      trainingColumnKeys: string[];
      reason: string;
    };

  if (!trainingColumnKeys?.length || !reason) {
    throw new ApiError(
      "trainingColumnKeys (array) and reason are required",
      400,
      "missing_field"
    );
  }

    const supabase = createServerClient();

    // 1. Resolve employees
    let employeeIds: string[] = [];

    if (division) {
      const { data, error } = await supabase
        .from("employees")
        .select("id, department, division, position")
        .eq("is_active", true);
      if (error) {
        throw new ApiError(`failed to read employees: ${error.message}`, 500, "internal");
      }
      const divLower = division.toLowerCase();
      const posLower = position?.trim().toLowerCase() ?? "";
      employeeIds = (data ?? [])
        .filter((e) => {
          // Prefer division, fall back to department for pre-division rows
          const canonical = (e.division ?? e.department ?? "").toLowerCase();
          return canonical === divLower;
        })
        .filter((e) =>
          posLower ? (e.position ?? "").toLowerCase() === posLower : true
        )
        .map((e) => e.id);
    } else if (employeeNames?.length) {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("is_active", true);
      if (error) {
        throw new ApiError(`failed to read employees: ${error.message}`, 500, "internal");
      }
      // Accept both "First Last" and "Last, First" so both the
      // /compliance CSV export (Last, First) and the /sessions
      // detail panel (First Last) use the same endpoint.
      const nameSet = new Set(employeeNames.map((n) => n.toLowerCase().trim()));
      employeeIds = (data ?? [])
        .filter((e) => {
          const first = (e.first_name ?? "").trim().toLowerCase();
          const last = (e.last_name ?? "").trim().toLowerCase();
          const firstLast = `${first} ${last}`.trim();
          const lastFirst = `${last}, ${first}`.trim();
          return nameSet.has(firstLast) || nameSet.has(lastFirst);
        })
        .map((e) => e.id);
  } else {
    throw new ApiError(
      "Either division or employeeNames is required",
      400,
      "missing_field"
    );
  }

  if (employeeIds.length === 0) {
    return { excused: 0, skipped: 0 };
  }

    // 2. Resolve training_type_ids from column_keys
    const { data: trainingTypes, error: ttErr } = await supabase
      .from("training_types")
      .select("id, column_key");
    if (ttErr) {
      throw new ApiError(`failed to read training_types: ${ttErr.message}`, 500, "internal");
    }

    const keyToId = new Map<string, number>();
    for (const tt of trainingTypes ?? []) {
      keyToId.set(tt.column_key.toLowerCase(), tt.id);
    }

    const trainingTypeIds = trainingColumnKeys
      .map((k) => keyToId.get(k.toLowerCase()))
      .filter((id): id is number => id != null);

  if (trainingTypeIds.length === 0) {
    return { excused: 0, skipped: 0, error: "No matching training types found" };
  }

    // 3. Build and upsert excusals
    const rows = [];
    for (const empId of employeeIds) {
      for (const ttId of trainingTypeIds) {
        rows.push({
          employee_id: empId,
          training_type_id: ttId,
          reason,
          source: "manual",
        });
      }
    }

    const BATCH_SIZE = 200;
    let excused = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await supabase
        .from("excusals")
        .upsert(batch, { onConflict: "employee_id,training_type_id" });
      if (upsertErr) {
        throw new ApiError(`failed to upsert excusals: ${upsertErr.message}`, 500, "internal");
      }
      excused += batch.length;
    }

    // Excusing someone should also pull them off any future sessions
    // for that training. Otherwise HR marks them excused but the
    // schedule still shows them enrolled, which is confusing.
    const dropped = await dropEnrollmentsForExcusedPairs(
      rows.map((r) => ({
        employee_id: r.employee_id,
        training_type_id: r.training_type_id,
      }))
    );

  return { excused, skipped: 0, enrollmentsDropped: dropped };
});
