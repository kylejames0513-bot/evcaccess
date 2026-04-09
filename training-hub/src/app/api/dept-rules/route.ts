import { getDeptRules, setDeptRule, removeDeptRule } from "@/lib/hub-settings";
import { createServerClient } from "@/lib/supabase";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

export async function GET() {
  try {
    const rules = await getDeptRules();
    return Response.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, department } = body;

    if (!department) {
      return Response.json({ error: "Missing department" }, { status: 400 });
    }

    if (action === "remove") {
      const rules = await removeDeptRule(department);
      return Response.json({ rules });
    }

    const { tracked, required } = body;
    if (!tracked || !Array.isArray(tracked)) {
      return Response.json({ error: "Missing tracked array" }, { status: 400 });
    }

    const rules = await setDeptRule(department, tracked, required || []);

    // Apply changes to Supabase immediately
    try {
      await applyRuleToSupabase(department, new Set(tracked));
    } catch (err) {
      console.error("Failed to apply rule to Supabase:", err);
    }

    return Response.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
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
  const deptEmployees = (employees || []).filter((emp: any) => {
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

  const colKeyToTypeId = new Map<string, string>();
  for (const tt of trainingTypes || []) {
    if (allTrainingCols.has(tt.column_key)) {
      colKeyToTypeId.set(tt.column_key, tt.id);
    }
  }

  const employeeIds = deptEmployees.map((e: any) => e.id);

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
  for (const exc of excusals || []) {
    excusalMap.set(`${exc.employee_id}|${exc.training_type_id}`, { id: exc.id, reason: exc.reason });
  }

  const recordSet = new Set<string>();
  for (const rec of records || []) {
    recordSet.add(`${rec.employee_id}|${rec.training_type_id}`);
  }

  let cellsWritten = 0;

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
          cellsWritten++;
        }
      } else {
        // Not tracked — add NA excusal if no record and no excusal
        if (!hasRecord && !existingExcusal) {
          await supabase.from("excusals").upsert(
            { employee_id: emp.id, training_type_id: typeId, reason: "NA" },
            { onConflict: "employee_id,training_type_id" }
          );
          cellsWritten++;
        }
      }
    }
  }
}
