import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data: employees, error } = await supabase
      .from("employees")
      .select("department")
      .eq("is_active", true)
      .limit(10000);

    if (error) throw new Error(`Failed to load employees: ${error.message}`);

    const divisions = new Set<string>();
    for (const emp of employees || []) {
      const div = (emp.department || "").trim();
      if (div) divisions.add(div);
    }

    const sorted = Array.from(divisions).sort();
    return Response.json({ divisions: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
