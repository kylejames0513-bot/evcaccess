// Legacy route superseded by /api/required-trainings. Slated for
// deletion once the settings page migrates to the new required_trainings
// table CRUD. Kept tidy in the meantime.
import { getDeptRules, setDeptRule, removeDeptRule } from "@/lib/hub-settings";
import { createServerClient } from "@/lib/supabase";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const rules = await getDeptRules();
  return { rules };
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { action, department } = body;

  if (!department) {
    throw new ApiError("Missing department", 400, "missing_field");
  }

  if (action === "remove") {
    const rules = await removeDeptRule(department);
    return { rules };
  }

  const { tracked, required } = body;
  if (!tracked || !Array.isArray(tracked)) {
    throw new ApiError("Missing tracked array", 400, "missing_field");
  }

  const rules = await setDeptRule(department, tracked, required || []);

  // Apply changes to Supabase immediately
  try {
    await applyRuleToSupabase(department, new Set(tracked));
  } catch (err) {
    console.error("Failed to apply rule to Supabase:", err);
  }

  return { rules };
});

interface EmployeeLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
}

interface ExcusalLite {
  id: string;
  employee_id: string;
  training_type_id: number;
  reason: string;
}

interface RecordLite {
  employee_id: string;
  training_type_id: number;
}

/**
 * Apply a department rule to Supabase:
 * - Untracked + no record/excusal → insert NA excusal
 * - Tracked + has NA excusal → remove the excusal
 */
async function applyRuleToSupabase(department: string, trackedSet: Set<string>) {
  const supabase = createServerClient();

  // Fetch active employees in this department
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, department")
    .eq("is_active", true)
    .limit(10000);

  if (empError) throw new Error(`Failed to load employees: ${empError.message}`);

  // Filter by department (flexible match)
  const deptLower = department.toLowerCase().replace(/\s*-\s*/g, "-");
  const deptEmployees = ((employees || []) as EmployeeLite[]).filter((emp) => {
    const empDiv = (emp.department || "").trim().toLowerCase().replace(/\s*-\s*/g, "-");
    return empDiv === deptLower;
  });

  if (deptEmployees.length === 0) return;

  // Build set of all training column keys
  const allTrainingCols = new Set<string>();
  const seenKeys = new Set<string>();
  for (const def of TRAINING_DEFINITIONS) {
    if (seenKeys.has(def.columnKey)) continue;
    seenKeys.add(def.columnKey);
    allTrainingCols.add(def.columnKey);
  }
  allTrainingCols.add("FIRSTAID");

  // Fetch training types for these column keys
  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, column_key");

  const colKeyToTypeId = new Map<string, number>();
  for (const tt of trainingTypes || []) {
    if (tt.column_key && allTrainingCols.has(tt.column_key)) {
      colKeyToTypeId.set(tt.column_key, tt.id);
    }
  }

  const employeeIds = deptEmployees.map((e) => e.id);

  // Fetch existing excusals for these employees
  const { data: excusals } = await supabase
    .from("excusals")
    .select("id, employee_id, training_type_id, reason")
    .in("employee_id", employeeIds);

  // Fetch existing training records
  const { data: records } = await supabase
    .from("training_records")
    .select("employee_id, training_type_id")
    .in("employee_id", employeeIds);

  const excusalMap = new Map<string, { id: string; reason: string }>();
  for (const exc of (excusals || []) as ExcusalLite[]) {
    excusalMap.set(`${exc.employee_id}|${exc.training_type_id}`, { id: exc.id, reason: exc.reason });
  }

  const recordSet = new Set<string>();
  for (const rec of (records || []) as RecordLite[]) {
    recordSet.add(`${rec.employee_id}|${rec.training_type_id}`);
  }

  for (const emp of deptEmployees) {
    for (const colKey of allTrainingCols) {
      const typeId = colKeyToTypeId.get(colKey);
      if (!typeId) continue;

      const key = `${emp.id}|${typeId}`;
      const existingExcusal = excusalMap.get(key);
      const hasRecord = recordSet.has(key);

      if (trackedSet.has(colKey)) {
        // Tracked — remove NA excusal if present
        if (existingExcusal && (existingExcusal.reason === "NA" || existingExcusal.reason === "N/A")) {
          await supabase.from("excusals").delete().eq("id", existingExcusal.id);
        }
      } else {
        // Not tracked — add NA excusal if no record and no excusal
        if (!hasRecord && !existingExcusal) {
          await supabase.from("excusals").upsert(
            { employee_id: emp.id, training_type_id: typeId, reason: "NA" },
            { onConflict: "employee_id,training_type_id" }
          );
        }
      }
    }
  }
}
