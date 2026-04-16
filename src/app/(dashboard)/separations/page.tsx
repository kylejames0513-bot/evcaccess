import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

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

  // Summary stats
  const total = rows.length;
  const voluntary = rows.filter(r => r.separation_type === "voluntary").length;
  const volPct = total > 0 ? Math.round((voluntary / total) * 100) : 0;
  const avgTenure = total > 0 ? Math.round(rows.reduce((s, r) => s + (r.tenure_days ?? 0), 0) / total) : 0;
  const avgTenureYears = (avgTenure / 365).toFixed(1);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="caption">Pillar III</p>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
            Separations
          </h1>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            Every departure, with reasons and tenure.
          </p>
        </div>
        <Button asChild className="rounded-md bg-[--accent] text-white hover:bg-[--accent]/90">
          <Link href="/separations/new">Log a separation</Link>
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-4">
          <p className="caption">Total</p>
          <p className="font-display text-2xl font-medium mt-1 tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-4">
          <p className="caption">Voluntary %</p>
          <p className="font-display text-2xl font-medium mt-1 tabular-nums">{volPct}%</p>
        </div>
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-4">
          <p className="caption">Avg tenure</p>
          <p className="font-display text-2xl font-medium mt-1 tabular-nums">{avgTenureYears} yr</p>
        </div>
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-4">
          <p className="caption">Involuntary</p>
          <p className="font-display text-2xl font-medium mt-1 tabular-nums">
            {rows.filter(r => r.separation_type === "involuntary").length}
          </p>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-12 text-center">
          <p className="font-display italic text-[--ink-muted]">
            No separations on record. A quiet stretch.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
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
                <tr key={sep.id} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/separations/${sep.id}`} className="text-[--accent] hover:underline">
                      {sep.legal_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[--ink-soft]">{sep.department ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {sep.separation_date ? new Date(sep.separation_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      sep.separation_type === "voluntary" ? "bg-[--warn-soft] text-[--warn]" :
                      sep.separation_type === "involuntary" ? "bg-[--alert-soft] text-[--alert]" :
                      "bg-[--surface-alt] text-[--ink-muted]"
                    }`}>
                      {sep.separation_type ?? "other"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[--ink-soft] max-w-[200px] truncate">{sep.reason_primary ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-[--ink-soft]">
                    {sep.tenure_days != null ? `${(sep.tenure_days / 365).toFixed(1)} yr` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${
                      sep.rehire_eligible === "yes" ? "text-[--success]" :
                      sep.rehire_eligible === "no" ? "text-[--alert]" :
                      "text-[--ink-muted]"
                    }`}>
                      {sep.rehire_eligible ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[--ink-muted]">{sep.evc_fiscal_year ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
