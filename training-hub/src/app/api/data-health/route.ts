import { createServerClient } from "@/lib/supabase";

// ============================================================
// Data Quality scan — Supabase-native checks
// ============================================================

async function fetchAllPaged<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => { range: (from: number, to: number) => any },
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return out;
}

export async function GET() {
  try {
    const supabase = createServerClient();

    // Fetch all active employees
    interface EmployeeRow {
      id: string;
      first_name: string | null;
      last_name: string | null;
      department: string | null;
      hire_date: string | null;
      is_active: boolean;
    }

    const { data: employeesData, error: empError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, department, hire_date, is_active")
      .eq("is_active", true)
      .order("last_name")
      .limit(10000);

    if (empError) throw new Error(`Failed to load employees: ${empError.message}`);
    const employeeRows: EmployeeRow[] = (employeesData || []) as EmployeeRow[];
    const employeeIds = employeeRows.map((e) => e.id);

    // Paginate training records
    const records = await fetchAllPaged<{
      id: string;
      employee_id: string;
      training_type_id: string;
      completion_date: string | null;
    }>(() =>
      supabase
        .from("training_records")
        .select("id, employee_id, training_type_id, completion_date")
    );

    // Paginate excusals
    const excusals = await fetchAllPaged<{
      id: string;
      employee_id: string;
      training_type_id: string;
    }>(() =>
      supabase.from("excusals").select("id, employee_id, training_type_id")
    );

    // Build lookup of valid employee IDs
    const validEmployeeIds = new Set(employeeIds);

    // ──────── Issue 1: Employees missing department ────────
    const missingDepartment = employeeRows
      .filter((e) => !e.department || !e.department.trim())
      .map((e) => ({
        id: e.id,
        name: `${e.last_name}${e.first_name ? `, ${e.first_name}` : ""}`,
      }));

    // ──────── Issue 2: Employees missing hire_date ────────
    const missingHireDate = employeeRows
      .filter((e) => !e.hire_date)
      .map((e) => ({
        id: e.id,
        name: `${e.last_name}${e.first_name ? `, ${e.first_name}` : ""}`,
      }));

    // ──────── Issue 3: Records with bad/future completion dates ────────
    const today = new Date();
    const minDate = new Date("1990-01-01");
    const badDates = records
      .filter((r) => {
        if (!r.completion_date) return false;
        const d = new Date(r.completion_date);
        if (isNaN(d.getTime())) return true;
        return d > today || d < minDate;
      })
      .map((r) => ({
        recordId: r.id,
        employeeId: r.employee_id,
        date: r.completion_date,
      }));

    // ──────── Issue 4: Duplicate employees by (last, first) ────────
    const nameMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const emp of employeeRows) {
      const last = (emp.last_name || "").trim().toLowerCase();
      const first = (emp.first_name || "").trim().toLowerCase();
      if (!last) continue;
      const key = `${last}|${first}`;
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push({
        id: emp.id,
        name: `${emp.last_name}${emp.first_name ? `, ${emp.first_name}` : ""}`,
      });
    }
    const duplicateEmployees: Array<{ name: string; ids: string[] }> = [];
    for (const [, group] of nameMap) {
      if (group.length > 1) {
        duplicateEmployees.push({
          name: group[0].name,
          ids: group.map((g) => g.id),
        });
      }
    }

    // ──────── Issue 5: Orphan training records (employee no longer active) ────────
    const orphanRecords = records
      .filter((r) => !validEmployeeIds.has(r.employee_id))
      .map((r) => ({ recordId: r.id, employeeId: r.employee_id }));

    // ──────── Issue 6: Orphan excusals ────────
    const orphanExcusals = excusals
      .filter((e) => !validEmployeeIds.has(e.employee_id))
      .map((e) => ({ excusalId: e.id, employeeId: e.employee_id }));

    const summary = {
      total:
        missingDepartment.length +
        missingHireDate.length +
        badDates.length +
        duplicateEmployees.length +
        orphanRecords.length +
        orphanExcusals.length,
      missingDepartment: missingDepartment.length,
      missingHireDate: missingHireDate.length,
      badDates: badDates.length,
      duplicates: duplicateEmployees.length,
      orphanRecords: orphanRecords.length,
      orphanExcusals: orphanExcusals.length,
      totalEmployees: employeeRows.length,
      totalRecords: records.length,
      totalExcusals: excusals.length,
    };

    return Response.json({
      summary,
      issues: {
        missingDepartment,
        missingHireDate,
        badDates,
        duplicateEmployees,
        orphanRecords,
        orphanExcusals,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
