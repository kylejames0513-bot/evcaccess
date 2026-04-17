import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, Section, StatCard } from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";

function currentFY(): number {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 7 ? year + 1 : year;
}

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fy = currentFY();
  const lastFY = fy - 1;

  // Separations by FY
  type FYRow = { evc_fiscal_year: number; department: string | null; separations: number; voluntary: number; involuntary: number; avg_tenure_days: number | null; avg_tenure_years: number | null };
  const { data: fyDataRaw } = await supabase
    .from("vw_turnover_by_fy")
    .select("evc_fiscal_year, department, separations, voluntary, involuntary, avg_tenure_days, avg_tenure_years")
    .order("evc_fiscal_year", { ascending: false });
  const fyData = (fyDataRaw ?? []) as unknown as FYRow[];

  // Current FY totals
  const currentFYRows = fyData.filter(r => r.evc_fiscal_year === fy);
  const currentFYTotal = currentFYRows.reduce((s, r) => s + r.separations, 0);
  const currentFYVoluntary = currentFYRows.reduce((s, r) => s + r.voluntary, 0);
  const currentFYInvoluntary = currentFYRows.reduce((s, r) => s + r.involuntary, 0);
  const volPct = currentFYTotal > 0 ? Math.round((currentFYVoluntary / currentFYTotal) * 100) : 0;
  const currentAvgTenure = currentFYRows.length > 0
    ? (currentFYRows.reduce((s, r) => s + (r.avg_tenure_days ?? 0), 0) / currentFYRows.length / 365).toFixed(1)
    : "0";

  // Last FY comparison
  const lastFYTotal = fyData.filter(r => r.evc_fiscal_year === lastFY).reduce((s, r) => s + r.separations, 0);
  const fyDelta = lastFYTotal > 0 ? Math.round(((currentFYTotal - lastFYTotal) / lastFYTotal) * 100) : 0;

  // Hires pipeline stats
  const { count: activeHires } = await supabase
    .from("new_hires")
    .select("id", { count: "exact", head: true })
    .not("stage", "in", '("complete","withdrew","terminated_in_probation")');

  const { count: completedHires } = await supabase
    .from("new_hires")
    .select("id", { count: "exact", head: true })
    .eq("stage", "complete");

  const { count: withdrewHires } = await supabase
    .from("new_hires")
    .select("id", { count: "exact", head: true })
    .in("stage", ["withdrew", "terminated_in_probation"]);

  // Top reasons by FY
  const { data: reasons } = await supabase
    .from("separations")
    .select("reason_primary")
    .eq("evc_fiscal_year", fy)
    .not("reason_primary", "is", null);

  const reasonCounts = new Map<string, number>();
  for (const r of reasons ?? []) {
    const reason = r.reason_primary ?? "Unknown";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Departments by FY
  const deptCounts = new Map<string, { separations: number; voluntary: number }>();
  for (const r of currentFYRows) {
    const dept = r.department ?? "Unknown";
    const existing = deptCounts.get(dept) ?? { separations: 0, voluntary: 0 };
    deptCounts.set(dept, {
      separations: existing.separations + r.separations,
      voluntary: existing.voluntary + r.voluntary,
    });
  }
  const topDepts = Array.from(deptCounts.entries())
    .sort((a, b) => b[1].separations - a[1].separations)
    .slice(0, 8);

  // Year-over-year history
  const allFYs = Array.from(new Set(fyData.map(r => r.evc_fiscal_year))).sort((a, b) => b - a).slice(0, 5);
  const fyHistory = allFYs.map(year => ({
    year,
    separations: fyData.filter(r => r.evc_fiscal_year === year).reduce((s, r) => s + r.separations, 0),
    voluntary: fyData.filter(r => r.evc_fiscal_year === year).reduce((s, r) => s + r.voluntary, 0),
  }));

  const maxSep = Math.max(...fyHistory.map(h => h.separations), 1);
  const maxReason = Math.max(...topReasons.map(r => r[1]), 1);
  const maxDept = Math.max(...topDepts.map(d => d[1].separations), 1);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Cross-pillar"
        title="Analytics"
        subtitle="Year-over-year trends, retention curves, and turnover by reason."
      />

      <Section label={`FY ${fy} Scorecard · July ${fy - 1} – June ${fy}`}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Separations"
            value={currentFYTotal}
            hint={
              fyDelta !== 0
                ? `${fyDelta > 0 ? "↑" : "↓"} ${Math.abs(fyDelta)}% vs FY ${lastFY}`
                : undefined
            }
            tone={fyDelta > 0 ? "alert" : fyDelta < 0 ? "success" : "default"}
          />
          <StatCard label="Voluntary %" value={`${volPct}%`} />
          <StatCard label="Avg tenure" value={`${currentAvgTenure} yr`} />
          <StatCard label="Involuntary" value={currentFYInvoluntary} tone="alert" />
        </div>
        <p className="pt-2 font-display text-sm italic text-[--ink-soft]">
          {currentFYTotal === 0
            ? "No separations this fiscal year. A quiet stretch."
            : `${currentFYTotal} separation${currentFYTotal === 1 ? "" : "s"} this fiscal year. ` +
              `${fyDelta > 0 ? `Up ${fyDelta}% from FY ${lastFY}.` : fyDelta < 0 ? `Down ${Math.abs(fyDelta)}% from FY ${lastFY}.` : "Steady with last year."}`}
        </p>
      </Section>

      <Section label="Hire Pipeline">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Active" value={activeHires ?? 0} tone="success" />
          <StatCard label="Completed" value={completedHires ?? 0} />
          <StatCard label="Withdrew / terminated" value={withdrewHires ?? 0} tone="alert" />
          <StatCard
            label="Completion rate"
            value={
              (completedHires ?? 0) + (withdrewHires ?? 0) > 0
                ? `${Math.round(((completedHires ?? 0) / ((completedHires ?? 0) + (withdrewHires ?? 0))) * 100)}%`
                : "—"
            }
          />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* YoY separations */}
        <Section label="Separations by fiscal year">
          <div className="panel p-6">
            {fyHistory.length === 0 ? (
              <p className="py-8 text-center font-display italic text-[--ink-muted]">
                No historical data yet.
              </p>
            ) : (
              <div className="space-y-3">
                {fyHistory.map(h => (
                  <div key={h.year} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-[--ink-muted] tabular-nums">FY {h.year}</span>
                    <div className="flex-1 h-6 rounded bg-[--surface-alt] overflow-hidden relative">
                      <div
                        className="h-full bg-[--accent] transition-all"
                        style={{ width: `${(h.voluntary / maxSep) * 100}%` }}
                      />
                      <div
                        className="h-full bg-[--alert]/70 absolute top-0 transition-all"
                        style={{
                          left: `${(h.voluntary / maxSep) * 100}%`,
                          width: `${((h.separations - h.voluntary) / maxSep) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right tabular-nums font-medium">{h.separations}</span>
                  </div>
                ))}
                <div className="flex gap-4 pt-2 text-xs text-[--ink-muted]">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[--accent]" /><span>Voluntary</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[--alert]/70" /><span>Involuntary</span></div>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Top departments */}
        <Section label={`Top departments FY ${fy}`}>
          <div className="panel p-6">
            {topDepts.length === 0 ? (
              <p className="py-8 text-center font-display italic text-[--ink-muted]">
                No department data for this fiscal year.
              </p>
            ) : (
              <div className="space-y-2">
                {topDepts.map(([dept, data]) => (
                  <div key={dept} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate text-[--ink]" title={dept}>{dept}</span>
                    <div className="flex-1 h-5 rounded bg-[--surface-alt] overflow-hidden">
                      <div
                        className="h-full bg-[--accent]/70"
                        style={{ width: `${(data.separations / maxDept) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums text-[--ink-muted]">{data.separations}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Top reasons */}
      <Section label={`Turnover by reason · FY ${fy}`}>
        <div className="panel p-6">
          {topReasons.length === 0 ? (
            <p className="py-8 text-center font-display italic text-[--ink-muted]">
              No reasons recorded for this fiscal year yet.
            </p>
          ) : (
            <div className="space-y-2">
              {topReasons.map(([reason, count]) => (
                <div key={reason} className="flex items-center gap-3 text-sm">
                  <span className="w-48 truncate text-[--ink]" title={reason}>{reason}</span>
                  <div className="flex-1 h-5 rounded bg-[--surface-alt] overflow-hidden">
                    <div
                      className="h-full bg-[--warn]/60"
                      style={{ width: `${(count / maxReason) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-[--ink-muted]">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
