// ============================================================
// GET /api/new-hires — employees hired within the last 90 days,
// with a per-employee rollup of how many required trainings they
// have completed and which ones remain.
// ============================================================
// The page at /new-hires renders this as a dashboard for the HR
// team so they can focus on onboarding training gaps.
//
// The required-training calculation matches the logic used by the
// employee_compliance view: universal rules apply to everyone
// except the Board, and division-scoped rules apply when
// employees.division matches required_trainings.department (with
// fallback to employees.department for historical rows that were
// loaded before the division column existed). Position overrides
// narrow the division match further.
// ============================================================

import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

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

export const GET = withApiHandler(async () => {
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
  if (error) {
    throw new ApiError(`failed to read employees: ${error.message}`, 500, "internal");
  }
  const empRows = (employees ?? []) as EmployeeRow[];
  if (empRows.length === 0) {
    return { newHires: [] };
  }

  const employeeIds = empRows.map((e) => e.id);

  // Training type names + column_keys. We need the column_key so a
  // completion or excusal under a sibling type (e.g. "Initial Med
  // Training") satisfies a requirement on the other (e.g. "Med Recert").
  // Both share column_key="MED_TRAIN".
  const { data: types, error: typesErr } = await db
    .from("training_types")
    .select("id, name, column_key")
    .eq("is_active", true);
  if (typesErr) {
    throw new ApiError(`failed to read training_types: ${typesErr.message}`, 500, "internal");
  }
  const typeNameMap = new Map<number, string>();
  const columnKeyById = new Map<number, string>();
  // siblings: column_key -> Set<training_type_id>
  const siblingsByKey = new Map<string, Set<number>>();
  for (const t of (types ?? []) as { id: number; name: string; column_key: string }[]) {
    typeNameMap.set(t.id, t.name);
    columnKeyById.set(t.id, t.column_key);
    if (!siblingsByKey.has(t.column_key)) siblingsByKey.set(t.column_key, new Set());
    siblingsByKey.get(t.column_key)!.add(t.id);
  }

  // Training records for only these employees (avoids the 1 000-row cap
  // that silently truncated the old unfiltered query).
  const { data: records, error: recErr } = await db
    .from("training_records")
    .select("employee_id, training_type_id")
    .in("employee_id", employeeIds);
  if (recErr) {
    throw new ApiError(`failed to read training_records: ${recErr.message}`, 500, "internal");
  }
  // Index completions by (employee_id, column_key) so any sibling
  // training_type satisfies the lookup.
  const completedSet = new Set<string>();
  for (const r of records ?? []) {
    const key = columnKeyById.get(r.training_type_id);
    if (!key) continue;
    completedSet.add(`${r.employee_id}|${key}`);
  }

  // Excusals also count as "satisfied" — same column_key sharing rules
  // as completions. Mirrors the LATERAL excusal join in the compliance
  // view migration 20260414000100.
  const { data: excRows, error: excErr } = await db
    .from("excusals")
    .select("employee_id, training_type_id")
    .in("employee_id", employeeIds);
  if (excErr) {
    throw new ApiError(`failed to read excusals: ${excErr.message}`, 500, "internal");
  }
  const excusedSet = new Set<string>();
  for (const r of excRows ?? []) {
    const key = columnKeyById.get(r.training_type_id);
    if (!key) continue;
    excusedSet.add(`${r.employee_id}|${key}`);
  }

  // Required trainings rules (loaded once, filtered per employee)
  const { data: rulesData, error: rulesErr } = await db
    .from("required_trainings")
    .select("*")
    .eq("is_required", true);
  if (rulesErr) {
    throw new ApiError(`failed to read required_trainings: ${rulesErr.message}`, 500, "internal");
  }
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

    // Canonical division name: prefer employees.division, fall back
    // to employees.department for historical rows that never got the
    // division column filled in. Mirrors compliance view v3.
    const canonicalDivision = emp.division ?? emp.department ?? "";
    const empDivLower = canonicalDivision.toLowerCase();
    const isBoard = empDivLower === "board";
    // Precedence map: training_type_id → { specificity, required }
    // position (3) > department (2) > universal (1).
    const winning = new Map<number, { specificity: number; required: boolean }>();

    function consider(ruleId: number, specificity: number, required: boolean) {
      const existing = winning.get(ruleId);
      if (!existing || specificity > existing.specificity) {
        winning.set(ruleId, { specificity, required });
      }
    }

    for (const rule of rules) {
      if (rule.is_universal) {
        if (!isBoard) consider(rule.training_type_id, 1, rule.is_required);
        continue;
      }
      if (!rule.department || !canonicalDivision) continue;
      if (rule.department.toLowerCase() !== empDivLower) continue;
      if (rule.position == null) {
        consider(rule.training_type_id, 2, rule.is_required);
      } else if (emp.position && rule.position.toLowerCase() === emp.position.toLowerCase()) {
        consider(rule.training_type_id, 3, rule.is_required);
      }
    }

    let completed = 0;
    const missing: string[] = [];
    for (const [ttId, rule] of winning) {
      if (!rule.required) continue;
      const colKey = columnKeyById.get(ttId);
      // If the training_type has no column_key (shouldn't happen, but
      // defend against it), fall back to the legacy id-only check.
      const satisfied = colKey
        ? completedSet.has(`${emp.id}|${colKey}`) || excusedSet.has(`${emp.id}|${colKey}`)
        : false;
      if (satisfied) {
        completed++;
      } else {
        missing.push(typeNameMap.get(ttId) ?? `Training ${ttId}`);
      }
    }

    const daysEmployed = Math.round((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24));

    newHires.push({
      name: `${emp.last_name}, ${emp.first_name}`,
      employeeId: emp.id,
      // The UI column is labelled "Division"; expose canonicalDivision
      // so the client doesn't need to know about the dual department/
      // division storage.
      division: canonicalDivision,
      hireDate: `${hireDate.getMonth() + 1}/${hireDate.getDate()}/${hireDate.getFullYear()}`,
      daysEmployed,
      totalTrainings: [...winning.values()].filter((v) => v.required).length,
      completedTrainings: completed,
      missingTrainings: missing,
    });
  }

  newHires.sort((a, b) =>
    a.daysEmployed !== b.daysEmployed
      ? a.daysEmployed - b.daysEmployed
      : a.name.localeCompare(b.name)
  );

  return { newHires };
});
