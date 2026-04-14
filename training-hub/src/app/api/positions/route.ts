import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/positions?department=Residential
 * Returns sorted unique positions for active employees.
 * If department (actually the division name) is provided, filters
 * to employees whose division matches it (falling back to
 * employees.department for historical rows that have no division).
 */
export const GET = withApiHandler(async (req) => {
  const supabase = createServerClient();
  const divisionFilter = req.nextUrl.searchParams.get("department");

  // Paginate — Supabase caps unranged selects at 1000 rows by default,
  // which silently dropped positions once headcount crossed that line.
  const positions = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  for (;;) {
    const query = supabase
      .from("employees")
      .select("position, division, department")
      .eq("is_active", true)
      .not("position", "is", null);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new ApiError(`failed to read employees: ${error.message}`, 500, "internal");
    }
    if (!data || data.length === 0) break;
    for (const emp of data) {
      const pos = (emp.position ?? "").trim();
      if (!pos) continue;
      if (divisionFilter) {
        const canonical = (emp.division ?? emp.department ?? "").toLowerCase();
        if (canonical !== divisionFilter.toLowerCase()) continue;
      }
      positions.add(pos);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { positions: Array.from(positions).sort() };
});
