import { createServerClient } from "@/lib/supabase";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
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

  return { divisions: Array.from(divisions).sort() };
});
