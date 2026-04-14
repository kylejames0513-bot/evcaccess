import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

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
    if (error) throw new ApiError(`data-health query failed: ${error.message}`, 500, "internal");
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return out;
}

export const GET = withApiHandler(async () => {
  const supabase = createServerClient();

  interface EmployeeRow {
    id: string;
    first_name: string | null;
    last_name: string | null;
    department: string | null;
    division: string | null;
    hire_date: string | null;
    is_active: boolean;
  }

  // Fetch ALL employees paginated. Critical that we don't use a plain
  // `.limit(n)` here because PostgREST silently caps single responses
  // at 1000 rows regardless of the limit value. With ~2200 employees,
  // using `.limit(10000)` only returned the first 1000, which caused
  // every record/excusal pointing at an employee beyond row 1000 to be
  // falsely flagged as an orphan (~3800 training records and ~5600
  // excusals wrongly flagged). A true orphan is a row whose
  // employee_id does not exist in the employees table at all —
  // terminated employees still count.
  const allEmployees = await fetchAllPaged<EmployeeRow>(() =>
    supabase
      .from("employees")
      .select("id, first_name, last_name, department, division, hire_date, is_active")
  );

  const employeeRows: EmployeeRow[] = allEmployees.filter((e) => e.is_active);
  const allEmployeeIds = new Set(allEmployees.map((e) => e.id));

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

  // A true orphan is a row whose employee_id does not exist in the
  // employees table AT ALL. Terminated employees (is_active=false) are
  // NOT orphans — their history is deliberately preserved.
  const validEmployeeIds = allEmployeeIds;

    // ──────── Issue 1: Employees missing division/department ────────
    // Both columns count: an employee with at least one of them set
    // can still match required_trainings rules via the COALESCE in
    // the compliance view. Only flag when BOTH are empty.
    const missingDepartment = employeeRows
      .filter((e) => {
        const div = (e.division ?? "").trim();
        const dept = (e.department ?? "").trim();
        return div.length === 0 && dept.length === 0;
      })
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

  return {
    summary,
    issues: {
      missingDepartment,
      missingHireDate,
      badDates,
      duplicateEmployees,
      orphanRecords,
      orphanExcusals,
    },
  };
});
