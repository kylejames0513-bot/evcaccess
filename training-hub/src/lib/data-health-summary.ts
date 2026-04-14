import { createServerClient } from "@/lib/supabase";
import { ApiError } from "@/lib/api-handler";

type PagedResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<PagedResponse<T>>;
};

async function fetchAllPaged<T>(
  buildQuery: () => PagedQuery<T>,
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

export interface DataHealthSummary {
  total: number;
  missingDepartment: number;
  missingHireDate: number;
  badDates: number;
  duplicates: number;
  orphanRecords: number;
  orphanExcusals: number;
  totalEmployees: number;
  totalRecords: number;
  totalExcusals: number;
}

interface EmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  division: string | null;
  hire_date: string | null;
  is_active: boolean;
}

export async function computeDataHealthSummary(): Promise<DataHealthSummary> {
  const supabase = createServerClient();
  const allEmployees = await fetchAllPaged<EmployeeRow>(() =>
    supabase
      .from("employees")
      .select("id, first_name, last_name, department, division, hire_date, is_active")
  );

  const employeeRows = allEmployees.filter((e) => e.is_active);
  const allEmployeeIds = new Set(allEmployees.map((e) => e.id));

  const records = await fetchAllPaged<{
    id: string;
    employee_id: string;
    completion_date: string | null;
  }>(() => supabase.from("training_records").select("id, employee_id, completion_date"));

  const excusals = await fetchAllPaged<{
    id: string;
    employee_id: string;
  }>(() => supabase.from("excusals").select("id, employee_id"));

  const missingDepartment = employeeRows.filter((e) => {
    const div = (e.division ?? "").trim();
    const dept = (e.department ?? "").trim();
    return div.length === 0 && dept.length === 0;
  }).length;

  const missingHireDate = employeeRows.filter((e) => !e.hire_date).length;

  const today = new Date();
  const minDate = new Date("1990-01-01");
  const badDates = records.filter((r) => {
    if (!r.completion_date) return false;
    const d = new Date(r.completion_date);
    if (isNaN(d.getTime())) return true;
    return d > today || d < minDate;
  }).length;

  const nameMap = new Map<string, number>();
  for (const emp of employeeRows) {
    const last = (emp.last_name || "").trim().toLowerCase();
    const first = (emp.first_name || "").trim().toLowerCase();
    if (!last) continue;
    const key = `${last}|${first}`;
    nameMap.set(key, (nameMap.get(key) ?? 0) + 1);
  }
  const duplicates = [...nameMap.values()].filter((n) => n > 1).length;

  const orphanRecords = records.filter((r) => !allEmployeeIds.has(r.employee_id)).length;
  const orphanExcusals = excusals.filter((r) => !allEmployeeIds.has(r.employee_id)).length;

  return {
    total:
      missingDepartment +
      missingHireDate +
      badDates +
      duplicates +
      orphanRecords +
      orphanExcusals,
    missingDepartment,
    missingHireDate,
    badDates,
    duplicates,
    orphanRecords,
    orphanExcusals,
    totalEmployees: employeeRows.length,
    totalRecords: records.length,
    totalExcusals: excusals.length,
  };
}
