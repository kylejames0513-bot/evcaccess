import { createServerClient } from "@/lib/supabase";

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  division: string | null;
  position: string | null;
  hire_date: string | null;
}

interface RuleRow {
  training_type_id: number;
  is_required: boolean;
  is_universal: boolean;
  department: string | null;
  position: string | null;
}

export async function GET() {
  try {
    const db = createServerClient();
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const cutoffStr = ninetyDaysAgo.toISOString().split("T")[0];

    // Active employees hired within the last 90 days (filtered server-side
    // so the result stays well under Supabase's default 1 000-row limit).
    const { data: employees, error } = await db
      .from("employees")
      .select("id, first_name, last_name, department, division, position, hire_date")
      .eq("is_active", true)
      .gte("hire_date", cutoffStr);
    if (error) throw error;
    const empRows = (employees ?? []) as EmployeeRow[];
    if (empRows.length === 0) {
      return Response.json({ newHires: [] });
    }

    const employeeIds = empRows.map((e) => e.id);

    // Training type names
    const { data: types } = await db.from("training_types").select("id, name").eq("is_active", true);
    const typeNameMap = new Map((types ?? []).map((t: { id: number; name: string }) => [t.id, t.name as string]));

    // Training records for only these employees (avoids the 1 000-row cap
    // that silently truncated the old unfiltered query).
    const { data: records } = await db
      .from("training_records")
      .select("employee_id, training_type_id")
      .in("employee_id", employeeIds);
    const completedSet = new Set<string>();
    for (const r of records ?? []) {
      completedSet.add(`${r.employee_id}|${r.training_type_id}`);
    }

    // Required trainings rules (loaded once, filtered per employee)
    const { data: rulesData } = await db.from("required_trainings").select("*").eq("is_required", true);
    const rules = (rulesData ?? []) as RuleRow[];

    const newHires: Array<{
      name: string;
      employeeId: string;
      division: string;
      hireDate: string;
      daysEmployed: number;
      totalTrainings: number;
      completedTrainings: number;
      missingTrainings: string[];
    }> = [];

    for (const emp of empRows) {
      const hireDate = new Date(emp.hire_date!);

      // Determine which trainings are required for THIS employee
      // based on universal + division + position rules.
      // required_trainings.department stores the division name;
      // match it against employees.division (mirrors the compliance view).
      const requiredMap = new Map<number, boolean>();
      for (const rule of rules) {
        if (!rule.is_required) continue;
        if (rule.is_universal) {
          requiredMap.set(rule.training_type_id, true);
        } else if (rule.department && emp.division &&
          rule.department.toLowerCase() === emp.division.toLowerCase()) {
          if (rule.position == null) {
            requiredMap.set(rule.training_type_id, true);
          } else if (emp.position && rule.position.toLowerCase() === emp.position.toLowerCase()) {
            requiredMap.set(rule.training_type_id, true);
          }
        }
      }

      let completed = 0;
      const missing: string[] = [];
      for (const [ttId] of requiredMap) {
        if (completedSet.has(`${emp.id}|${ttId}`)) {
          completed++;
        } else {
          missing.push(typeNameMap.get(ttId) ?? `Training ${ttId}`);
        }
      }

      const daysEmployed = Math.round((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24));

      newHires.push({
        name: `${emp.last_name}, ${emp.first_name}`,
        employeeId: emp.id,
        division: emp.department ?? "",
        hireDate: `${hireDate.getMonth() + 1}/${hireDate.getDate()}/${hireDate.getFullYear()}`,
        daysEmployed,
        totalTrainings: requiredMap.size,
        completedTrainings: completed,
        missingTrainings: missing,
      });
    }

    newHires.sort((a, b) => a.daysEmployed !== b.daysEmployed ? a.daysEmployed - b.daysEmployed : a.name.localeCompare(b.name));

    return Response.json({ newHires });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
