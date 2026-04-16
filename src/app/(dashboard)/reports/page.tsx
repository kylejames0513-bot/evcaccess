import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-[#8b8fa3]">PDF and CSV exports for audits and regulators.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
          <Link href="/api/reports/compliance-pdf" target="_blank" rel="noreferrer">
            Compliance audit PDF
          </Link>
        </Button>
      </div>
    </div>
  );
}
