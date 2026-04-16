import Link from "next/link";
import { redirect } from "next/navigation";
import { EmployeesTable } from "@/components/training-hub/employees-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  // Counts for filter badges
  const { count: activeCount } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active");
  const { count: inactiveCount } = await supabase.from("employees").select("id", { count: "exact", head: true }).neq("status", "active");
  const { count: totalCount } = await supabase.from("employees").select("id", { count: "exact", head: true });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="caption">Roster</p>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
            Employees
          </h1>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            {rows.length} employee{rows.length === 1 ? "" : "s"} shown.
          </p>
        </div>
        <Link
          href="/employees/new"
          className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
        >
          Add employee
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        <FilterLink href="/employees?status=active" active={statusFilter === "active"} label={`Active (${activeCount ?? 0})`} />
        <FilterLink href="/employees?status=terminated" active={statusFilter === "terminated"} label={`Terminated (${inactiveCount ?? 0})`} />
        <FilterLink href="/employees?status=all" active={statusFilter === "all"} label={`All (${totalCount ?? 0})`} />
      </div>

      <EmployeesTable rows={rows} />
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <a
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[--accent-soft] text-[--accent]"
          : "text-[--ink-muted] hover:bg-[--surface-alt]"
      }`}
    >
      {label}
    </a>
  );
}
