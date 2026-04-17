import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EmptyPanel,
  PageHeader,
  Pill,
  PrimaryLink,
  StatCard,
} from "@/components/training-hub/page-primitives";
import { cn } from "@/lib/utils";

export default async function SeparationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: separations } = await supabase
    .from("separations")
    .select("id, legal_name, position, department, hire_date, separation_date, tenure_days, separation_type, reason_primary, rehire_eligible, calendar_year, evc_fiscal_year")
    .order("separation_date", { ascending: false })
    .limit(200);

  const rows = separations ?? [];

  const total = rows.length;
  const voluntary = rows.filter(r => r.separation_type === "voluntary").length;
  const involuntary = rows.filter(r => r.separation_type === "involuntary").length;
  const volPct = total > 0 ? Math.round((voluntary / total) * 100) : 0;
  const avgTenure = total > 0 ? Math.round(rows.reduce((s, r) => s + (r.tenure_days ?? 0), 0) / total) : 0;
  const avgTenureYears = (avgTenure / 365).toFixed(1);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pillar III"
        title="Separations"
        subtitle="Every departure, with reasons and tenure."
        actions={<PrimaryLink href="/separations/new">Log a separation</PrimaryLink>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={total} />
        <StatCard label="Voluntary %" value={`${volPct}%`} />
        <StatCard label="Avg tenure" value={`${avgTenureYears} yr`} />
        <StatCard label="Involuntary" value={involuntary} tone={involuntary > 0 ? "alert" : "default"} />
      </div>

      {rows.length === 0 ? (
        <EmptyPanel title="No separations on record. A quiet stretch." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">Name</th>
                <th className="caption px-4 py-3 text-left">Department</th>
                <th className="caption px-4 py-3 text-left">Separation Date</th>
                <th className="caption px-4 py-3 text-left">Type</th>
                <th className="caption px-4 py-3 text-left">Reason</th>
                <th className="caption px-4 py-3 text-left">Tenure</th>
                <th className="caption px-4 py-3 text-left">Rehire</th>
                <th className="caption px-4 py-3 text-left">FY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sep) => (
                <tr key={sep.id} className="row-hover border-b border-[--rule] last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/separations/${sep.id}`} className="text-[--accent] hover:underline">
                      {sep.legal_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[--ink-soft]">{sep.department ?? "—"}</td>
                  <td className="px-4 py-3 tabular">
                    {sep.separation_date
                      ? new Date(sep.separation_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={sep.separation_type === "voluntary" ? "warn" : sep.separation_type === "involuntary" ? "alert" : "muted"}>
                      {sep.separation_type ?? "other"}
                    </Pill>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-[--ink-soft]">{sep.reason_primary ?? "—"}</td>
                  <td className="px-4 py-3 tabular text-[--ink-soft]">
                    {sep.tenure_days != null ? `${(sep.tenure_days / 365).toFixed(1)} yr` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "text-xs font-medium",
                      sep.rehire_eligible === "yes" ? "text-[--success]" :
                      sep.rehire_eligible === "no" ? "text-[--alert]" :
                      "text-[--ink-muted]"
                    )}>
                      {sep.rehire_eligible ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular text-[--ink-muted]">{sep.evc_fiscal_year ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
