import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ComplianceMiniChart } from "@/components/training-hub/compliance-mini-chart";
import { buildComplianceMatrix } from "@/lib/compliance-matrix";

export default async function DashboardPage() {
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

  const { count: activeEmployees } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("status", "active");

  const { count: trainingTypes } = await supabase
    .from("training_types")
    .select("id", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("archived", false);

  // Fetch compliance data for chart
  const { data: allTrainings } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", profile.org_id)
    .eq("archived", false);

  const { data: requirements } = await supabase
    .from("training_requirements")
    .select("training_type_id, position, department, division")
    .eq("org_id", profile.org_id);

  const { data: allEmployees } = await supabase
    .from("employees")
    .select("id, paylocity_id, first_name, last_name, position, department, location")
    .eq("org_id", profile.org_id)
    .eq("status", "active");

  const { data: allCompletions } = await supabase
    .from("completions")
    .select("employee_id, training_type_id, completed_on, expires_on, source")
    .eq("org_id", profile.org_id);

  const { data: allExemptions } = await supabase
    .from("exemptions")
    .select("employee_id, training_type_id, expires_on")
    .eq("org_id", profile.org_id);

  const matrix = buildComplianceMatrix({
    employees: (allEmployees ?? []).map(e => ({
      id: e.id,
      paylocity_id: e.paylocity_id,
      first_name: e.first_name,
      last_name: e.last_name,
      position: e.position,
      department: e.department ?? "",
      location: e.location,
    })),
    trainings: (allTrainings ?? []).map(t => ({ id: t.id, name: t.name })),
    requirements: (requirements ?? []).map(r => ({
      training_type_id: r.training_type_id,
      position: r.position,
      department: r.department ?? null,
      division: r.division ?? null,
    })),
    completions: allCompletions ?? [],
    exemptions: allExemptions ?? [],
  });

  // Count statuses
  const statusCounts = { CURRENT: 0, DUE_SOON: 0, EXPIRED: 0, NEVER_COMPLETED: 0 };
  for (const [, row] of matrix) {
    for (const [, cell] of row) {
      if (cell.status in statusCounts) {
        statusCounts[cell.status as keyof typeof statusCounts]++;
      }
    }
  }

  const chartData = [
    { name: "Current", value: statusCounts.CURRENT },
    { name: "Due soon", value: statusCounts.DUE_SOON },
    { name: "Expired", value: statusCounts.EXPIRED },
    { name: "Never", value: statusCounts.NEVER_COMPLETED },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-[#8b8fa3]">
          Snapshot of roster size and catalog depth. Open compliance for the full matrix.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
          <CardHeader>
            <CardTitle className="text-base">Active employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl">{activeEmployees ?? 0}</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-[#3b82f6]">
              <Link href="/employees">Open roster</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
          <CardHeader>
            <CardTitle className="text-base">Training types</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl">{trainingTypes ?? 0}</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-[#3b82f6]">
              <Link href="/trainings">Manage catalog</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
          <CardHeader>
            <CardTitle className="text-base">Compliance trend</CardTitle>
          </CardHeader>
          <CardContent className="h-40">
            <ComplianceMiniChart data={chartData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
