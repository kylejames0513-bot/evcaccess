import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/training-hub/onboarding-wizard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
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
  if (profile?.org_id) redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1117] px-4 text-[#e8eaed]">
      <OnboardingWizard />
    </div>
  );
}
