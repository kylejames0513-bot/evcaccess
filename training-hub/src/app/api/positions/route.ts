import { createServerClient } from "@/lib/supabase";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/positions?department=Residential
 * Returns sorted unique positions for active employees.
 * If department is provided, filters to that department only.
 */
export const GET = withApiHandler(async (req) => {
  const supabase = createServerClient();
  const department = req.nextUrl.searchParams.get("department");

  // Paginate — Supabase caps unranged selects at 1000 rows by default,
  // which silently dropped positions once headcount crossed that line.
  const positions = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  for (;;) {
    let query = supabase
      .from("employees")
      .select("position")
      .eq("is_active", true)
      .not("position", "is", null);
    if (department) {
      query = query.ilike("department", department);
    }
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const emp of data) {
      const pos = (emp.position ?? "").trim();
      if (pos) positions.add(pos);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { positions: Array.from(positions).sort() };
});
