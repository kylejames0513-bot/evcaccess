import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[#8b8fa3]">Organization profile, integrations, and account.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
          <CardHeader>
            <CardTitle className="text-base">Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[#8b8fa3]">
            <p>Name: {org?.name}</p>
            <p>Slug: {org?.slug}</p>
            <p>Regulator: {org?.regulator}</p>
            <p>Fiscal year starts month: {org?.fiscal_year_start_month}</p>
            {profile.role === "admin" ? (
              <p className="text-xs text-[#5c6078]">Logo upload and color tokens ship in the polish pass.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="border-[#2a2e3d] bg-[#1e2230] text-[#e8eaed]">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="border-[#2a2e3d]">
              <Link href="/settings/account">Manage sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
