import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PageHeader,
  PrimaryLink,
  SecondaryLink,
  Section,
  StatCard,
} from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";

type CellStatus = "COMPLIANT" | "DUE_SOON" | "OVERDUE" | "NEVER_COMPLETED" | "EXEMPT" | "CADENCE_NOT_SET" | "FAILED";

export default async function CompliancePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: requirements } = await supabase
    .from("requirements")
    .select("id, training_id, role, department");

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_first_name, legal_last_name, position, department, location")
    .eq("status", "active")
    .order("legal_last_name");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title, cadence_type, cadence_months")
    .eq("active", true)
    .order("code");

  const { data: exclusions } = await supabase
    .from("exclusions")
    .select("training_id, role, department");

  const { data: completions } = await supabase
    .from("completions")
    .select("employee_id, training_id, completed_on, expires_on, status");

  const reqs = requirements ?? [];
  const emps = employees ?? [];
  const trs = trainings ?? [];
  const comps = completions ?? [];
  const excls = exclusions ?? [];

  const requiredTrainingIds = new Set<string>();
  type Cell = { status: CellStatus; completedOn: string | null; expiresOn: string | null; daysUntil: number | null };
  const cells = new Map<string, Cell>();
  const today = new Date();
  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 30);

  function isExcluded(emp: { position: string | null; department: string | null; location: string | null }, trainingId: string): boolean {
    for (const exc of excls) {
      if (exc.training_id !== trainingId) continue;
      const posMatch = !exc.role || exc.role === emp.position;
      const deptMatch = !exc.department || exc.department === emp.department || exc.department === emp.location;
      if (posMatch && deptMatch) return true;
    }
    return false;
  }

  for (const emp of emps) {
    for (const req of reqs) {
      const posMatch = !req.role || req.role === emp.position;
      const deptMatch = !req.department || req.department === emp.department || req.department === emp.location;
      if (!posMatch || !deptMatch) continue;

      if (isExcluded(emp, req.training_id)) {
        const key = `${emp.id}|${req.training_id}`;
        if (!cells.has(key)) {
          requiredTrainingIds.add(req.training_id);
          cells.set(key, { status: "EXEMPT", completedOn: null, expiresOn: null, daysUntil: null });
        }
        continue;
      }

      requiredTrainingIds.add(req.training_id);
      const key = `${emp.id}|${req.training_id}`;
      if (cells.has(key)) continue;

      const tr = trs.find(t => t.id === req.training_id);
      const empComps = comps.filter(c => c.employee_id === emp.id && c.training_id === req.training_id);

      if (empComps.some(c => c.status === "exempt")) {
        cells.set(key, { status: "EXEMPT", completedOn: null, expiresOn: null, daysUntil: null });
        continue;
      }

      const latest = empComps
        .filter(c => c.completed_on && c.status !== "failed")
        .sort((a, b) => (b.completed_on! > a.completed_on! ? 1 : -1))[0];

      if (!latest) {
        cells.set(key, { status: "NEVER_COMPLETED", completedOn: null, expiresOn: null, daysUntil: null });
        continue;
      }

      if (tr?.cadence_type === "unset") {
        cells.set(key, { status: "CADENCE_NOT_SET", completedOn: latest.completed_on, expiresOn: null, daysUntil: null });
        continue;
      }

      if (!latest.expires_on) {
        cells.set(key, { status: "COMPLIANT", completedOn: latest.completed_on, expiresOn: null, daysUntil: null });
        continue;
      }

      const exp = new Date(latest.expires_on + "T00:00:00");
      const daysUntil = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (exp < today) {
        cells.set(key, { status: "OVERDUE", completedOn: latest.completed_on, expiresOn: latest.expires_on, daysUntil });
      } else if (exp <= soonDate) {
        cells.set(key, { status: "DUE_SOON", completedOn: latest.completed_on, expiresOn: latest.expires_on, daysUntil });
      } else {
        cells.set(key, { status: "COMPLIANT", completedOn: latest.completed_on, expiresOn: latest.expires_on, daysUntil });
      }
    }
  }

  const requiredTrainings = trs.filter(t => requiredTrainingIds.has(t.id));

  const summary: Record<string, number> = {};
  for (const [, cell] of cells) {
    summary[cell.status] = (summary[cell.status] ?? 0) + 1;
  }

  const totalCounted = Array.from(cells.values()).filter(c => c.status !== "CADENCE_NOT_SET" && c.status !== "EXEMPT").length;
  const compliantCount = (summary.COMPLIANT ?? 0);
  const compliancePct = totalCounted > 0 ? Math.round((compliantCount / totalCounted) * 100) : 0;

  type OverdueItem = { empId: string; empName: string; trCode: string; trTitle: string; daysOverdue: number; completedOn: string | null };
  const overdue: OverdueItem[] = [];
  for (const [key, cell] of cells) {
    if (cell.status === "OVERDUE" && cell.daysUntil !== null) {
      const [empId, trId] = key.split("|");
      const emp = emps.find(e => e.id === empId);
      const tr = trs.find(t => t.id === trId);
      if (emp && tr) {
        overdue.push({
          empId,
          empName: `${emp.legal_last_name}, ${emp.legal_first_name}`,
          trCode: tr.code,
          trTitle: tr.title,
          daysOverdue: Math.abs(cell.daysUntil),
          completedOn: cell.completedOn,
        });
      }
    }
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const hasRequirements = reqs.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pillar I"
        title="Compliance"
        subtitle={
          hasRequirements
            ? `${emps.length} employees × ${requiredTrainings.length} required trainings. ${compliantCount} compliant, ${summary.OVERDUE ?? 0} overdue.`
            : "No training requirements defined yet. Set up requirements first."
        }
        actions={
          <>
            <PrimaryLink href="/requirements">Manage requirements</PrimaryLink>
            <SecondaryLink href="/api/reports/compliance-pdf" external>
              Download PDF
            </SecondaryLink>
          </>
        }
      />

      {!hasRequirements ? (
        <div className="panel border-[--accent]/25 bg-[--accent-soft] px-6 py-10 text-center">
          <p className="font-display text-lg text-[--ink]">
            Set up training requirements to see compliance status.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[--ink-soft]">
            Requirements define which trainings each employee must complete, based on their position or department.
          </p>
          <div className="mt-4">
            <PrimaryLink href="/requirements">Create requirements</PrimaryLink>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard
              label="Compliance"
              value={`${compliancePct}%`}
              tone={compliancePct >= 85 ? "success" : compliancePct >= 70 ? "warn" : "alert"}
            />
            <StatCard label="Compliant" value={summary.COMPLIANT ?? 0} tone="success" />
            <StatCard label="Due soon" value={summary.DUE_SOON ?? 0} tone="warn" />
            <StatCard label="Overdue" value={summary.OVERDUE ?? 0} tone="alert" />
            <StatCard label="Never completed" value={summary.NEVER_COMPLETED ?? 0} tone="muted" />
          </div>

          {overdue.length > 0 && (
            <Section label={`Overdue (${overdue.length})`}>
              <div className="panel overflow-x-auto">
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
                    {overdue.slice(0, 30).map((o, i) => (
                      <tr key={i} className="row-hover border-b border-[--rule] last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/employees/${o.empId}`} className="text-[--accent] hover:underline">{o.empName}</Link>
                        </td>
                        <td className="px-4 py-3">{o.trTitle}</td>
                        <td className="px-4 py-3 tabular text-[--ink-muted]">
                          {o.completedOn ? new Date(o.completedOn + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}
                        </td>
                        <td className="px-4 py-3 text-right tabular font-medium text-[--alert]">{o.daysOverdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {emps.length > 0 && requiredTrainings.length > 0 && (
            <Section label="Employee × Required Training Matrix">
              <div className="panel max-h-[600px] overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[--surface]">
                    <tr className="border-b border-[--rule]">
                      <th className="caption sticky left-0 z-20 min-w-[180px] border-r border-[--rule] bg-[--surface] px-3 py-2 text-left">
                        Employee
                      </th>
                      {requiredTrainings.map(t => (
                        <th key={t.id} className="caption min-w-[60px] px-2 py-2 text-center" title={t.title}>
                          <Link href={`/trainings/${t.id}`} className="hover:text-[--accent]">{t.code}</Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emps.map(e => {
                      const hasAny = requiredTrainings.some(t => cells.has(`${e.id}|${t.id}`));
                      if (!hasAny) return null;
                      return (
                        <tr key={e.id} className="row-hover border-b border-[--rule]">
                          <td className="sticky left-0 z-10 border-r border-[--rule] bg-[--surface] px-3 py-2">
                            <Link href={`/employees/${e.id}`} className="hover:text-[--accent]">
                              <div>{e.legal_last_name}, {e.legal_first_name}</div>
                              {e.department && (
                                <div className="text-[10px] text-[--ink-muted]">
                                  {e.department}{e.position ? ` · ${e.position}` : ""}
                                </div>
                              )}
                            </Link>
                          </td>
                          {requiredTrainings.map(t => {
                            const cell = cells.get(`${e.id}|${t.id}`);
                            if (!cell) return <td key={t.id} className="px-1 py-1 text-center"><span className="text-[--ink-muted]/30">·</span></td>;
                            return (
                              <td key={t.id} className="px-1 py-1 text-center" title={`${e.legal_last_name} / ${t.title}: ${cell.status}${cell.completedOn ? ` (${cell.completedOn})` : ""}`}>
                                <StatusDot status={cell.status} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Legend />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; char: string }> = {
    COMPLIANT: { bg: "bg-[--success-soft]", color: "text-[--success]", char: "●" },
    DUE_SOON: { bg: "bg-[--warn-soft]", color: "text-[--warn]", char: "●" },
    OVERDUE: { bg: "bg-[--alert-soft]", color: "text-[--alert]", char: "●" },
    NEVER_COMPLETED: { bg: "bg-[--surface-alt]", color: "text-[--ink-muted]", char: "○" },
    EXEMPT: { bg: "bg-[--surface-alt]", color: "text-[--ink-muted]", char: "×" },
    FAILED: { bg: "bg-[--alert-soft]", color: "text-[--alert]", char: "!" },
    CADENCE_NOT_SET: { bg: "bg-[--surface-alt]", color: "text-[--ink-muted]/50", char: "?" },
  };
  const c = cfg[status] ?? cfg.NEVER_COMPLETED;
  return <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${c.bg} ${c.color} text-xs font-bold`}>{c.char}</span>;
}

function Legend() {
  const items: Array<{ status: string; label: string }> = [
    { status: "COMPLIANT", label: "Compliant" },
    { status: "DUE_SOON", label: "Due Soon (30d)" },
    { status: "OVERDUE", label: "Overdue" },
    { status: "NEVER_COMPLETED", label: "Never Completed" },
    { status: "EXEMPT", label: "Exempt" },
    { status: "CADENCE_NOT_SET", label: "Cadence Not Set" },
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
