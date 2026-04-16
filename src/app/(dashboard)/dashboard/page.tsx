import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ComplianceMiniChart } from "@/components/training-hub/compliance-mini-chart";

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
            <ComplianceMiniChart />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
