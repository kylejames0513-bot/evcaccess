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

  const { data: rawRows } = await supabase
    .from("employees")
    .select("id, employee_id, legal_first_name, legal_last_name, position, location, hire_date, status")
    .order("legal_last_name", { ascending: true });

  /* Map to the shape EmployeesTable expects */
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="font-display text-2xl font-semibold tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            Employees
          </h1>
          <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
            Employee ID is the canonical key for every person.
          </p>
        </div>
        <Button asChild className="rounded-lg text-white" style={{ backgroundColor: "var(--accent)" }}>
          <Link href="/employees/new">Add employee</Link>
        </Button>
      </div>
      <EmployeesTable rows={rows} />
    </div>
  );
}
