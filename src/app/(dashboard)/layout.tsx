import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/training-hub/dashboard-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) redirect("/onboarding");

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.org_id)
    .maybeSingle();

  return <DashboardShell orgName={org?.name ?? "Organization"}>{children}</DashboardShell>;
}
