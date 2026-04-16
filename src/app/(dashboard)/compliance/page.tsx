import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CellStatus = "COMPLIANT" | "DUE_SOON" | "OVERDUE" | "NEVER_COMPLETED" | "EXEMPT" | "CADENCE_NOT_SET" | "FAILED";

export default async function CompliancePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Use the vw_compliance_status view directly — much faster than computing in JS
  type ComplianceStatusRow = {
    employee_id: string;
    paylocity_id: string;
    legal_first_name: string;
    legal_last_name: string;
    department: string | null;
    position: string | null;
    training_id: string;
    training_code: string;
    training_title: string;
    compliance_status: string;
    completed_on: string | null;
    expires_on: string | null;
    days_until_expiry: number | null;
  };
  const { data: statusRowsRaw } = await supabase
    .from("vw_compliance_status")
    .select("employee_id, paylocity_id, legal_first_name, legal_last_name, department, position, training_id, training_code, training_title, compliance_status, completed_on, expires_on, days_until_expiry")
    .limit(10000);
  const statusRows = (statusRowsRaw ?? []) as unknown as ComplianceStatusRow[];

  // Derive employees and trainings from the view
  const empMap = new Map<string, { id: string; employee_id: string; name: string; department: string | null; position: string | null }>();
  const trMap = new Map<string, { id: string; code: string; title: string }>();
  const cells = new Map<string, { status: CellStatus; days_until_expiry: number | null; completed_on: string | null }>();

  for (const row of statusRows) {
    if (!empMap.has(row.employee_id)) {
      empMap.set(row.employee_id, {
        id: row.employee_id,
        employee_id: row.paylocity_id,
        name: `${row.legal_last_name}, ${row.legal_first_name}`,
        department: row.department,
        position: row.position,
      });
    }
    if (!trMap.has(row.training_id)) {
      trMap.set(row.training_id, { id: row.training_id, code: row.training_code, title: row.training_title });
    }
    cells.set(`${row.employee_id}|${row.training_id}`, {
      status: (row.compliance_status || "COMPLIANT").toUpperCase() as CellStatus,
      days_until_expiry: row.days_until_expiry,
      completed_on: row.completed_on,
    });
  }

  const employees = Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const trainings = Array.from(trMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  // Summary counts
  const summary: Record<string, number> = {};
  for (const [, cell] of cells) {
    summary[cell.status] = (summary[cell.status] ?? 0) + 1;
  }

  // Overdue queue — employees with overdue trainings, sorted by days overdue
  type OverdueItem = { empId: string; empName: string; trainingCode: string; trainingTitle: string; daysOverdue: number; completedOn: string | null };
  const overdue: OverdueItem[] = [];
  for (const [key, cell] of cells) {
    if (cell.status === "OVERDUE" && cell.days_until_expiry !== null) {
      const [empId, trId] = key.split("|");
      const emp = empMap.get(empId);
      const tr = trMap.get(trId);
      if (emp && tr) {
        overdue.push({
          empId,
          empName: emp.name,
          trainingCode: tr.code,
          trainingTitle: tr.title,
          daysOverdue: Math.abs(cell.days_until_expiry),
          completedOn: cell.completed_on,
        });
      }
    }
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const totalCells = Array.from(cells.values()).filter(c => c.status !== "CADENCE_NOT_SET" && c.status !== "EXEMPT").length;
  const compliant = summary.COMPLIANT ?? 0;
  const compliancePct = totalCells > 0 ? Math.round((compliant / totalCells) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="caption">Pillar I</p>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
            Compliance
          </h1>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            {employees.length > 0
              ? `${employees.length} employees × ${trainings.length} trainings. ${compliant} current, ${summary.OVERDUE ?? 0} overdue.`
              : "No employees yet. Sync your roster to see compliance status."}
          </p>
        </div>
        <Link
          href="/api/reports/compliance-pdf"
          target="_blank"
          className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm font-medium hover:bg-[--surface-alt]"
        >
          Download audit PDF
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Compliance rate" value={`${compliancePct}%`} accent={compliancePct >= 85 ? "success" : compliancePct >= 70 ? "warn" : "alert"} />
        <StatCard label="Compliant" value={summary.COMPLIANT ?? 0} />
        <StatCard label="Due soon" value={summary.DUE_SOON ?? 0} accent="warn" />
        <StatCard label="Overdue" value={summary.OVERDUE ?? 0} accent="alert" />
        <StatCard label="Never completed" value={summary.NEVER_COMPLETED ?? 0} accent="muted" />
      </div>

      {/* Overdue queue */}
      {overdue.length > 0 && (
        <div>
          <p className="caption mb-3">Overdue Queue ({overdue.length})</p>
          <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Employee</th>
                  <th className="caption px-4 py-3 text-left">Training</th>
                  <th className="caption px-4 py-3 text-left">Last Completed</th>
                  <th className="caption px-4 py-3 text-right">Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {overdue.slice(0, 25).map((o, i) => (
                  <tr key={i} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt]">
                    <td className="px-4 py-3">
                      <Link href={`/employees/${o.empId}`} className="text-[--accent] hover:underline">{o.empName}</Link>
                    </td>
                    <td className="px-4 py-3">{o.trainingTitle}</td>
                    <td className="px-4 py-3 tabular-nums text-[--ink-muted]">
                      {o.completedOn ? new Date(o.completedOn + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[--alert] font-medium">{o.daysOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overdue.length > 25 && (
              <div className="border-t border-[--rule] px-4 py-2 text-xs text-[--ink-muted] text-center">
                Showing 25 of {overdue.length} overdue items
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compliance matrix */}
      {employees.length > 0 && trainings.length > 0 ? (
        <div>
          <p className="caption mb-3">Employee × Training Matrix</p>
          <div className="overflow-auto rounded-lg border border-[--rule] bg-[--surface] max-h-[600px]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[--surface] z-10">
                <tr className="border-b border-[--rule]">
                  <th className="sticky left-0 z-20 bg-[--surface] px-3 py-2 text-left caption border-r border-[--rule]">
                    Employee
                  </th>
                  {trainings.map(t => (
                    <th key={t.id} className="px-2 py-2 text-center caption min-w-[60px]" title={t.title}>
                      {t.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} className="border-b border-[--rule] hover:bg-[--surface-alt]">
                    <td className="sticky left-0 z-10 bg-[--surface] px-3 py-2 border-r border-[--rule]">
                      <div className="text-[--ink]">{e.name}</div>
                      {e.position && <div className="text-[10px] text-[--ink-muted]">{e.position}</div>}
                    </td>
                    {trainings.map(t => {
                      const cell = cells.get(`${e.id}|${t.id}`);
                      const st = cell?.status ?? "NEVER_COMPLETED";
                      return (
                        <td key={t.id} className="px-1 py-1 text-center" title={`${e.name} / ${t.title}: ${st}`}>
                          <StatusDot status={st} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
        </div>
      ) : (
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-12 text-center">
          <p className="font-display italic text-[--ink-muted]">
            {employees.length === 0 ? "No employees in the roster yet." : "No active trainings in the catalog."}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "success" | "warn" | "alert" | "muted" }) {
  const accentClass =
    accent === "success" ? "text-[--success]" :
    accent === "warn" ? "text-[--warn]" :
    accent === "alert" ? "text-[--alert]" :
    accent === "muted" ? "text-[--ink-muted]" : "";
  return (
    <div className="rounded-lg border border-[--rule] bg-[--surface] p-4">
      <p className="caption">{label}</p>
      <p className={`font-display text-2xl font-medium mt-1 tabular-nums ${accentClass}`}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; char: string }> = {
    COMPLIANT: { bg: "bg-[--success-soft]", color: "text-[--success]", char: "●" },
    DUE_SOON: { bg: "bg-[--warn-soft]", color: "text-[--warn]", char: "●" },
    OVERDUE: { bg: "bg-[--alert-soft]", color: "text-[--alert]", char: "●" },
    NEVER_COMPLETED: { bg: "bg-[--surface-alt]", color: "text-[--ink-muted]", char: "○" },
    EXEMPT: { bg: "bg-[--surface-alt]", color: "text-[--ink-muted]", char: "×" },
    FAILED: { bg: "bg-[--alert-soft]", color: "text-[--alert]", char: "!" },
    CADENCE_NOT_SET: { bg: "bg-[--surface-alt]", color: "text-[--ink-muted]/50", char: "·" },
  };
  const c = config[status] ?? config.NEVER_COMPLETED;
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${c.bg} ${c.color} text-xs font-bold`}>
      {c.char}
    </span>
  );
}

function Legend() {
  const items = [
    { status: "COMPLIANT", label: "Compliant" },
    { status: "DUE_SOON", label: "Due Soon" },
    { status: "OVERDUE", label: "Overdue" },
    { status: "NEVER_COMPLETED", label: "Never" },
    { status: "EXEMPT", label: "Exempt" },
    { status: "CADENCE_NOT_SET", label: "Cadence not set" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-[--ink-muted]">
      {items.map(i => (
        <div key={i.status} className="flex items-center gap-1.5">
          <StatusDot status={i.status} />
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}
