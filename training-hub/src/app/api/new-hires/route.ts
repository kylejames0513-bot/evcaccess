import { createServerClient } from "@/lib/supabase";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

export async function GET() {
  try {
    const supabase = createServerClient();

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Fetch active employees with hire dates
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name, department, hire_date")
      .eq("is_active", true);

    if (error) throw new Error(`Failed to load employees: ${error.message}`);
    if (!employees || employees.length === 0) return Response.json({ newHires: [] });

    // Fetch all training types
    const { data: trainingTypes } = await supabase
      .from("training_types")
      .select("id, name, column_key");

    const trainingTypeMap = new Map<string, { id: string; name: string }>();
    for (const tt of trainingTypes || []) {
      trainingTypeMap.set(tt.column_key, { id: tt.id, name: tt.name });
    }

    // Unique training column keys from definitions
    const trainingCols: Array<{ key: string; name: string }> = [];
    const seenKeys = new Set<string>();
    for (const def of TRAINING_DEFINITIONS) {
      if (seenKeys.has(def.columnKey)) continue;
      seenKeys.add(def.columnKey);
      trainingCols.push({ key: def.columnKey, name: def.name });
    }

    // Fetch training records and excusals for all active employees
    const employeeIds = employees.map((e) => e.id);

    const [recordsResult, excusalsResult] = await Promise.all([
      supabase
        .from("training_records")
        .select("employee_id, training_type_id")
        .in("employee_id", employeeIds),
      supabase
        .from("excusals")
        .select("employee_id, training_type_id")
        .in("employee_id", employeeIds),
    ]);

    // Build a set of "employee_id|training_type_id" for records and excusals
    const completedSet = new Set<string>();
    for (const rec of recordsResult.data || []) {
      completedSet.add(`${rec.employee_id}|${rec.training_type_id}`);
    }
    for (const exc of excusalsResult.data || []) {
      completedSet.add(`${exc.employee_id}|${exc.training_type_id}`);
    }

    const newHires: Array<{
      name: string;
      division: string;
      hireDate: string;
      daysEmployed: number;
      row: number;
      totalTrainings: number;
      completedTrainings: number;
      missingTrainings: string[];
    }> = [];

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const name = emp.first_name
        ? `${emp.last_name}, ${emp.first_name}`
        : emp.last_name;
      const division = emp.department || "";

      // Parse hire date
      let hireDate: Date | null = null;
      const hireDateStr = emp.hire_date || "";
      if (hireDateStr) {
        hireDate = new Date(hireDateStr);
        if (isNaN(hireDate.getTime())) hireDate = null;
      }

      // Count completed vs missing trainings
      let completed = 0;
      const missing: string[] = [];
      for (const col of trainingCols) {
        const tt = trainingTypeMap.get(col.key);
        if (!tt) continue;
        if (completedSet.has(`${emp.id}|${tt.id}`)) {
          completed++;
        } else {
          missing.push(col.name);
        }
      }

      // Determine if "new hire" by hire date OR by having zero completions
      const isNewByDate = hireDate && hireDate >= ninetyDaysAgo;
      const isNewByTrainings = completed === 0 && missing.length > 0;

      if (isNewByDate || isNewByTrainings) {
        const daysEmployed = hireDate
          ? Math.round((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24))
          : -1;
        const formattedHireDate = hireDate
          ? `${hireDate.getMonth() + 1}/${hireDate.getDate()}/${hireDate.getFullYear()}`
          : "";
        newHires.push({
          name,
          division,
          hireDate: formattedHireDate,
          daysEmployed,
          row: i + 2, // backward compat row index
          totalTrainings: trainingCols.length,
          completedTrainings: completed,
          missingTrainings: missing,
        });
      }
    }

    // Sort by hire date (newest first), then by name
    newHires.sort((a, b) => {
      if (a.daysEmployed >= 0 && b.daysEmployed >= 0) return a.daysEmployed - b.daysEmployed;
      if (a.daysEmployed >= 0) return -1;
      if (b.daysEmployed >= 0) return 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ newHires });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
