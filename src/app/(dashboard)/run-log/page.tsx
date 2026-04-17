import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyPanel, PageHeader, Pill } from "@/components/training-hub/page-primitives";

export default async function RunLogPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: runs } = await supabase
    .from("ingestion_runs")
    .select(
      "id, source, started_at, finished_at, status, rows_processed, rows_inserted, rows_updated, rows_skipped, rows_unresolved, error_summary",
    )
    .order("started_at", { ascending: false })
    .limit(40);

  const hasRows = (runs?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ingestion"
        title="Run log"
        subtitle="Ingestion runs and other batch jobs, newest first."
      />

      {!hasRows ? (
        <EmptyPanel title="No runs logged yet." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">Started</th>
                <th className="caption px-4 py-3 text-left">Source</th>
                <th className="caption px-4 py-3 text-left">Status</th>
                <th className="caption px-4 py-3 text-right">Inserted</th>
                <th className="caption px-4 py-3 text-right">Updated</th>
                <th className="caption px-4 py-3 text-right">Unresolved</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id} className="row-hover border-b border-[--rule] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-[--ink]">{r.started_at ?? "—"}</td>
                  <td className="px-4 py-3 text-[--ink-soft]">{r.source}</td>
                  <td className="px-4 py-3">
                    <Pill
                      tone={
                        r.status === "success"
                          ? "success"
                          : r.status === "partial"
                            ? "warn"
                            : r.status === "failed"
                              ? "alert"
                              : "muted"
                      }
                    >
                      {r.status ?? "—"}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-right tabular">{r.rows_inserted}</td>
                  <td className="px-4 py-3 text-right tabular">{r.rows_updated}</td>
                  <td className="px-4 py-3 text-right tabular text-[--ink-muted]">
                    {r.rows_unresolved > 0 ? r.rows_unresolved : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
