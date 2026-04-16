import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FileUploadDropzone } from "@/components/training-hub/file-upload-dropzone";

export default async function IngestionPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Recent ingestion runs
  const { data: runs } = await supabase
    .from("ingestion_runs")
    .select("id, source, started_at, finished_at, status, rows_processed, rows_inserted, rows_updated, rows_skipped, rows_unresolved, triggered_by, error_summary")
    .order("started_at", { ascending: false })
    .limit(25);

  // Unresolved review queue items
  const { data: reviewItems } = await supabase
    .from("review_queue")
    .select("id, source, reason, raw_payload, suggested_match_employee_id, suggested_match_score, resolved, created_at")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  const pendingCount = reviewItems?.length ?? 0;
  const runRows = runs ?? [];

  return (
    <div className="space-y-10">
      <div>
        <p className="caption">Operations</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Ingestion Console
        </h1>
        <p className="font-display text-sm italic text-[--ink-soft] mt-1">
          Data sync history and unresolved records.
        </p>
      </div>

      {/* File upload drop zone */}
      <div className="space-y-3">
        <p className="caption">Upload a file</p>
        <FileUploadDropzone />
      </div>

      {/* Manual sync CLI panel */}
      <div className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-4">
        <p className="caption">Manual sync via CLI</p>
        <p className="text-sm text-[--ink-soft]">
          Place files in <code className="font-mono text-xs bg-[--surface-alt] px-1.5 py-0.5 rounded">data/sources/</code> and run:
        </p>
        <div className="bg-[--surface-alt] rounded-md p-4 font-mono text-xs text-[--ink-soft] space-y-1">
          <p>npm run ingest:seed &nbsp;&nbsp;&nbsp;# First-time load all sources</p>
          <p>npm run ingest:refresh # Pull Google Sheets (Sources A + B)</p>
          <p>npm run ingest:dry-run # Preview without writing</p>
        </div>
        <p className="text-xs text-[--ink-muted]">
          Automated sync runs nightly via Vercel cron.
        </p>
      </div>

      {/* Review queue */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <p className="caption">Review queue</p>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[--warn-soft] text-xs font-medium text-[--warn] tabular-nums px-1.5">
              {pendingCount}
            </span>
          )}
        </div>

        {pendingCount === 0 ? (
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-8 text-center">
            <p className="font-display italic text-[--ink-muted]">
              No unresolved items. Ingestion is clean.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Source</th>
                  <th className="caption px-4 py-3 text-left">Reason</th>
                  <th className="caption px-4 py-3 text-left">Data</th>
                  <th className="caption px-4 py-3 text-left">Score</th>
                  <th className="caption px-4 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {(reviewItems ?? []).map((item) => {
                  const payload = item.raw_payload as Record<string, unknown> | null;
                  const name = payload ? `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim() : "—";
                  return (
                    <tr key={item.id} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt]">
                      <td className="px-4 py-3 text-[--ink-soft]">{item.source ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-[--warn-soft] px-2 py-0.5 text-xs font-medium text-[--warn]">
                          {item.reason ?? "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[--ink]">{name}</td>
                      <td className="px-4 py-3 tabular-nums text-[--ink-muted]">
                        {item.suggested_match_score != null ? `${Math.round(Number(item.suggested_match_score) * 100)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[--ink-muted]">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run history */}
      <div className="space-y-4">
        <p className="caption">Recent runs</p>
        {runRows.length === 0 ? (
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-8 text-center">
            <p className="font-display italic text-[--ink-muted]">
              No ingestion runs yet. Run your first seed to populate the database.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Started</th>
                  <th className="caption px-4 py-3 text-left">Source</th>
                  <th className="caption px-4 py-3 text-left">Status</th>
                  <th className="caption px-4 py-3 text-right">Processed</th>
                  <th className="caption px-4 py-3 text-right">Inserted</th>
                  <th className="caption px-4 py-3 text-right">Updated</th>
                  <th className="caption px-4 py-3 text-right">Unresolved</th>
                  <th className="caption px-4 py-3 text-left">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {runRows.map((run) => (
                  <tr key={run.id} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt]">
                    <td className="px-4 py-3 tabular-nums text-[--ink-soft]">
                      {run.started_at ? new Date(run.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3">{run.source}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        run.status === "success" ? "bg-[--success-soft] text-[--success]" :
                        run.status === "partial" ? "bg-[--warn-soft] text-[--warn]" :
                        run.status === "failed" ? "bg-[--alert-soft] text-[--alert]" :
                        "bg-[--surface-alt] text-[--ink-muted]"
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right">{run.rows_processed}</td>
                    <td className="px-4 py-3 tabular-nums text-right">{run.rows_inserted}</td>
                    <td className="px-4 py-3 tabular-nums text-right">{run.rows_updated}</td>
                    <td className="px-4 py-3 tabular-nums text-right">{run.rows_unresolved > 0 ? run.rows_unresolved : "—"}</td>
                    <td className="px-4 py-3 text-[--ink-muted]">{run.triggered_by ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
