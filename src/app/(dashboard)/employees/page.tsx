import { redirect } from "next/navigation";
import { EmployeesTable } from "@/components/training-hub/employees-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, PrimaryLink } from "@/components/training-hub/page-primitives";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dept?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const statusFilter = params.status ?? "active";

  let query = supabase
    .from("employees")
    .select("id, employee_id, legal_first_name, legal_last_name, position, department, location, hire_date, status")
    .order("legal_last_name", { ascending: true });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: rawRows } = await query;

  const rows = (rawRows ?? []).map((r) => ({
    id: r.id,
    paylocity_id: r.employee_id,
    first_name: r.legal_first_name,
    last_name: r.legal_last_name,
    position: r.position ?? "",
    location: r.location ?? "",
    hire_date: r.hire_date ?? "",
    status: r.status ?? "active",
  }));

  const { count: activeCount } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active");
  const { count: inactiveCount } = await supabase.from("employees").select("id", { count: "exact", head: true }).neq("status", "active");
  const { count: totalCount } = await supabase.from("employees").select("id", { count: "exact", head: true });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Roster"
        title="Employees"
        subtitle={`${rows.length} employee${rows.length === 1 ? "" : "s"} shown.`}
        actions={<PrimaryLink href="/employees/new">Add employee</PrimaryLink>}
      />

      <div className="flex flex-wrap gap-1.5">
        <FilterPill href="/employees?status=active" active={statusFilter === "active"} label={`Active (${activeCount ?? 0})`} />
        <FilterPill href="/employees?status=terminated" active={statusFilter === "terminated"} label={`Terminated (${inactiveCount ?? 0})`} />
        <FilterPill href="/employees?status=all" active={statusFilter === "all"} label={`All (${totalCount ?? 0})`} />
      </div>

      <EmployeesTable rows={rows} />
    </div>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <a
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
        active
          ? "bg-[--accent-soft] text-[--accent]"
          : "text-[--ink-muted] hover:bg-[--surface-alt] hover:text-[--ink]"
      )}
    >
      {label}
    </a>
  );
}
