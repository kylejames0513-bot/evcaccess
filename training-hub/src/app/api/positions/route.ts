import { createServerClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

/**
 * GET /api/positions?department=Residential
 * Returns sorted unique positions for active employees.
 * If department is provided, filters to that department only.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const department = req.nextUrl.searchParams.get("department");

    let query = supabase
      .from("employees")
      .select("position")
      .eq("is_active", true)
      .not("position", "is", null);

    if (department) {
      query = query.ilike("department", department);
    }

    const { data, error } = await query.limit(10000);
    if (error) throw error;

    const positions = new Set<string>();
    for (const emp of data ?? []) {
      const pos = (emp.position ?? "").trim();
      if (pos) positions.add(pos);
    }

    return Response.json({ positions: Array.from(positions).sort() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
