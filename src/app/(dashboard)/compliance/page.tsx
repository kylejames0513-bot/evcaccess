import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompliancePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_first_name, legal_last_name, position, department, location")
    .eq("status", "active")
    .order("legal_last_name");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title")
    .eq("active", true);

  const { data: requirements } = await supabase
    .from("requirements")
    .select("training_id, role, department");

  const { data: completions } = await supabase
    .from("completions")
    .select("employee_id, training_id, completed_on, expires_on, status, source");

  /* Build a simple compliance grid: for each employee x required training, check latest completion */
  type CellStatus = "CURRENT" | "DUE_SOON" | "EXPIRED" | "NEVER_COMPLETED" | "EXEMPT";

  const today = new Date();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);

  const cells: { employeeId: string; trainingId: string; status: CellStatus }[] = [];

  for (const e of employees ?? []) {
    /* Determine which trainings are required for this employee */
    const reqTrainingIds = new Set<string>();
    for (const r of requirements ?? []) {
      const roleMatch = !r.role || r.role === e.position;
      const deptMatch = !r.department || r.department === e.department;
      if (roleMatch && deptMatch) reqTrainingIds.add(r.training_id);
    }

    for (const t of trainings ?? []) {
      if (!reqTrainingIds.has(t.id)) continue;

      /* Find latest completion for this employee + training */
      const matching = (completions ?? []).filter(
        (c) => c.employee_id === e.id && c.training_id === t.id,
      );

      /* Check for exempt status */
      if (matching.some((c) => c.status === "exempt")) {
        cells.push({ employeeId: e.id, trainingId: t.id, status: "EXEMPT" });
        continue;
      }

      const latest = matching
        .filter((c) => c.completed_on)
        .sort((a, b) => (b.completed_on! > a.completed_on! ? 1 : -1))[0];

      if (!latest) {
        cells.push({ employeeId: e.id, trainingId: t.id, status: "NEVER_COMPLETED" });
        continue;
      }
      if (!latest.expires_on) {
        cells.push({ employeeId: e.id, trainingId: t.id, status: "CURRENT" });
        continue;
      }
      const exp = new Date(latest.expires_on);
      if (exp < today) {
        cells.push({ employeeId: e.id, trainingId: t.id, status: "EXPIRED" });
      } else if (exp <= soon) {
        cells.push({ employeeId: e.id, trainingId: t.id, status: "DUE_SOON" });
      } else {
        cells.push({ employeeId: e.id, trainingId: t.id, status: "CURRENT" });
      }
    }
  }

  const summary = cells.reduce(
    (acc, x) => {
      acc[x.status] = (acc[x.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-display text-2xl font-semibold tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            Compliance
          </h1>
          <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
            Matrix uses required trainings, completions, and exemptions. Tune requirements on Trainings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" style={{ borderColor: "var(--rule)" }}>
            <Link href="/api/reports/compliance-pdf" target="_blank" rel="noreferrer">
              Download audit PDF
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(["CURRENT", "DUE_SOON", "EXPIRED", "NEVER_COMPLETED"] as const).map((k) => (
          <div
            key={k}
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--surface)" }}
          >
            <p className="caption text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              {k.replaceAll("_", " ")}
            </p>
            <p className="mt-1 font-mono text-2xl" style={{ color: "var(--ink)" }}>
              {summary[k] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border" style={{ borderColor: "var(--rule)" }}>
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--rule)", backgroundColor: "var(--surface)" }}>
              <th className="sticky left-0 z-10 px-3 py-2 font-medium" style={{ color: "var(--ink-muted)", borderRight: "1px solid var(--rule)" }}>
                Employee
              </th>
              {(trainings ?? []).map((t) => (
                <th
                  key={t.id}
                  className="min-w-[72px] max-w-[120px] truncate px-2 py-2 font-medium"
                  style={{ color: "var(--ink-muted)", borderRight: "1px solid var(--rule)" }}
                  title={t.title}
                >
                  {t.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td
                  className="sticky left-0 z-10 px-3 py-2 font-mono text-[11px]"
                  style={{ color: "var(--ink)", borderRight: "1px solid var(--rule)", backgroundColor: "var(--bg)" }}
                >
                  <span className="block text-[10px]" style={{ color: "var(--ink-muted)" }}>
                    {e.employee_id}
                  </span>
                  {e.legal_last_name}, {e.legal_first_name}
                </td>
                {(trainings ?? []).map((t) => {
                  const cell = cells.find(
                    (c) => c.employeeId === e.id && c.trainingId === t.id,
                  );
                  const st = cell?.status ?? "NOT_REQUIRED";
                  const colorMap: Record<string, string> = {
                    CURRENT: "bg-[#22c55e]/20 text-[#22c55e]",
                    DUE_SOON: "bg-[#f59e0b]/20 text-[#f59e0b]",
                    EXPIRED: "bg-[#ef4444]/20 text-[#ef4444]",
                    NEVER_COMPLETED: "bg-[#5c6078]/25 text-[#8b8fa3]",
                    EXEMPT: "bg-[#3b82f6]/15 text-[#3b82f6]",
                    NOT_REQUIRED: "bg-transparent text-[#5c6078]",
                  };
                  return (
                    <td
                      key={t.id}
                      className="px-1 py-1 text-center"
                      style={{ borderRight: "1px solid var(--rule)" }}
                    >
                      <span
                        className={`inline-block min-h-8 min-w-8 rounded-md px-1 py-2 text-[10px] font-medium ${colorMap[st] ?? ""}`}
                        title={st}
                      >
                        {st === "NOT_REQUIRED" ? "\u00b7" : st.slice(0, 1)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
