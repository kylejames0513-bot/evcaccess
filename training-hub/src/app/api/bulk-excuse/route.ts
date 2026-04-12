import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * POST /api/bulk-excuse
 * Body: {
 *   division?: string,           // excuse all active employees in this division
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
      employeeNames,
      trainingColumnKeys,
      reason,
    } = body as {
      division?: string;
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
        .select("id, department")
        .eq("is_active", true);
      if (error) throw error;
      employeeIds = (data ?? [])
        .filter((e) => (e.department ?? "").toLowerCase() === division.toLowerCase())
        .map((e) => e.id);
    } else if (employeeNames?.length) {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("is_active", true);
      if (error) throw error;
      const nameSet = new Set(employeeNames.map((n) => n.toLowerCase()));
      employeeIds = (data ?? [])
        .filter((e) => {
          const full = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim().toLowerCase();
          return nameSet.has(full);
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
    if (ttErr) throw ttErr;

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
      if (upsertErr) throw upsertErr;
      excused += batch.length;
    }

  return { excused, skipped: 0 };
});
