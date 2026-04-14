// ============================================================
// GET /api/divisions — distinct division values across active
// employees. Used by the filter dropdowns on several pages.
// ============================================================
// Reads employees.division first (the canonical umbrella name)
// and falls back to employees.department if the row has no
// division set yet (pre-division-column historical rows).
// Mirrors the resolution used by the employee_compliance view.
// ============================================================

import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const supabase = createServerClient();

  // Paginate — Supabase caps unranged selects at 1000 rows by default,
  // so the old `.limit(10000)` silently dropped divisions once EVC grew
  // past that threshold.
  const divisions = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  for (;;) {
    const { data: employees, error } = await supabase
      .from("employees")
      .select("division, department")
      .eq("is_active", true)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new ApiError(`failed to read employees: ${error.message}`, 500, "internal");
    }
    if (!employees || employees.length === 0) break;
    for (const emp of employees) {
      const div = (emp.division ?? emp.department ?? "").trim();
      if (div) divisions.add(div);
    }
    if (employees.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { divisions: Array.from(divisions).sort() };
});
