import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ComplianceMatrix } from "@/components/training-hub/compliance-matrix";
import { buildComplianceMatrix } from "@/lib/compliance-matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompliancePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const orgId = profile.org_id;

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
    employees: employees ?? [],
    trainings: trainings ?? [],
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

  const cells: {
    employeeId: string;
    trainingId: string;
    status: string;
  }[] = [];
  for (const e of employees ?? []) {
    const row = matrix.get(e.id);
    if (!row) continue;
    for (const t of trainings ?? []) {
      const c = row.get(t.id);
      if (!c) continue;
      cells.push({ employeeId: e.id, trainingId: t.id, status: c.status });
    }
  }

  const summary = cells.reduce(
    (acc, x) => {
      acc[x.status] = (acc[x.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
          <p className="text-sm text-[#8b8fa3]">
            Matrix uses required trainings, completions, and exemptions. Tune requirements on Training types.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="border-[#2a2e3d]">
            <Link href="/api/reports/compliance-pdf" target="_blank" rel="noreferrer">
              Download audit PDF
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["CURRENT", "DUE_SOON", "EXPIRED", "NEVER_COMPLETED"] as const).map((k) => (
          <div key={k} className="rounded-xl border border-[#2a2e3d] bg-[#1e2230] p-4">
            <p className="text-xs uppercase tracking-wide text-[#5c6078]">{k.replaceAll("_", " ")}</p>
            <p className="mt-1 font-mono text-2xl text-[#e8eaed]">{summary[k] ?? 0}</p>
          </div>
        ))}
      </div>
      <ComplianceMatrix
        employees={employees ?? []}
        trainings={trainings ?? []}
        matrix={Object.fromEntries(
          [...matrix.entries()].map(([eid, row]) => [
            eid,
            Object.fromEntries(row.entries()),
          ])
        )}
      />
    </div>
  );
}
