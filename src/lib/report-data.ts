import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function loadComplianceReportRows(
  supabase: SupabaseClient<Database>,
  orgId: string,
) {
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_first_name, legal_last_name, position, department, location")
    .eq("status", "active")
    .order("legal_last_name");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, title")
    .eq("active", true);

  const { data: requirements } = await supabase
    .from("requirements")
    .select("training_id, role, department");

  const { data: completions } = await supabase
    .from("completions")
    .select("employee_id, training_id, completed_on, expires_on, status, source");

  const today = new Date();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);

  const lines: { employee: string; paylocity_id: string; training: string; status: string }[] = [];

  for (const e of employees ?? []) {
    const reqTrainingIds = new Set<string>();
    for (const r of requirements ?? []) {
      const roleMatch = !r.role || r.role === e.position;
      const deptMatch = !r.department || r.department === e.department;
      if (roleMatch && deptMatch) reqTrainingIds.add(r.training_id);
    }

    for (const t of trainings ?? []) {
      if (!reqTrainingIds.has(t.id)) continue;

      const matching = (completions ?? []).filter(
        (c) => c.employee_id === e.id && c.training_id === t.id,
      );

      if (matching.some((c) => c.status === "exempt")) {
        lines.push({
          employee: `${e.legal_last_name}, ${e.legal_first_name}`,
          paylocity_id: e.employee_id,
          training: t.title,
          status: "EXEMPT",
        });
        continue;
      }

      const latest = matching
        .filter((c) => c.completed_on)
        .sort((a, b) => (b.completed_on! > a.completed_on! ? 1 : -1))[0];

      let status: string;
      if (!latest) {
        status = "NEVER_COMPLETED";
      } else if (!latest.expires_on) {
        status = "CURRENT";
      } else {
        const exp = new Date(latest.expires_on);
        if (exp < today) status = "EXPIRED";
        else if (exp <= soon) status = "DUE_SOON";
        else status = "CURRENT";
      }

      lines.push({
        employee: `${e.legal_last_name}, ${e.legal_first_name}`,
        paylocity_id: e.employee_id,
        training: t.title,
        status,
      });
    }
  }

  return { orgName: org?.name ?? "Organization", lines };
}
