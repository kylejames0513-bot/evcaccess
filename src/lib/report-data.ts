import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildComplianceMatrix } from "@/lib/compliance-matrix";

export async function loadComplianceReportRows(
  supabase: SupabaseClient<Database>,
  orgId: string
) {
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, paylocity_id, first_name, last_name, position")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("last_name");

  const { data: trainings } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("archived", false)
    .eq("is_required", true);

  const { data: requirements } = await supabase
    .from("training_requirements")
    .select("training_type_id, position")
    .eq("org_id", orgId);

  const { data: completions } = await supabase
    .from("completions")
    .select("employee_id, training_type_id, completed_on, expires_on, source")
    .eq("org_id", orgId);

  const empIds = (employees ?? []).map((e) => e.id);
  const { data: exemptions } =
    empIds.length > 0
      ? await supabase
          .from("exemptions")
          .select("employee_id, training_type_id, expires_on")
          .in("employee_id", empIds)
      : { data: [] as { employee_id: string; training_type_id: string; expires_on: string | null }[] };

  const exemptionRows = (exemptions ?? []) as {
    employee_id: string;
    training_type_id: string;
    expires_on: string | null;
  }[];

  const matrix = buildComplianceMatrix({
    employees: (employees ?? []) as {
      id: string;
      paylocity_id: string;
      first_name: string;
      last_name: string;
      position: string;
    }[],
    trainings: (trainings ?? []) as { id: string; name: string }[],
    requirements: (requirements ?? []) as { training_type_id: string; position: string | null }[],
    completions: (completions ?? []) as {
      employee_id: string;
      training_type_id: string;
      completed_on: string;
      expires_on: string | null;
      source: "signin" | "import_paylocity" | "import_phs" | "manual" | "class_roster";
    }[],
    exemptions: exemptionRows,
  });

  const lines: { employee: string; paylocity_id: string; training: string; status: string }[] = [];
  for (const e of employees ?? []) {
    const row = matrix.get(e.id);
    if (!row) continue;
    for (const t of trainings ?? []) {
      const cell = row.get(t.id);
      if (!cell) continue;
      lines.push({
        employee: `${e.last_name}, ${e.first_name}`,
        paylocity_id: e.paylocity_id,
        training: t.name,
        status: cell.status,
      });
    }
  }

  return { orgName: org?.name ?? "Organization", lines };
}
