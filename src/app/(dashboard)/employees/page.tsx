import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmployeesTable } from "@/components/training-hub/employees-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeesPage() {
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

  const { data: rows } = await supabase
    .from("employees")
    .select("id, paylocity_id, first_name, last_name, position, location, hire_date, status")
    .eq("org_id", profile.org_id)
    .order("last_name", { ascending: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-[#8b8fa3]">Paylocity ID is the canonical key for every person.</p>
        </div>
        <Button asChild className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
          <Link href="/employees/new">Add employee</Link>
        </Button>
      </div>
      <EmployeesTable rows={rows ?? []} />
    </div>
  );
}
