import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FileUploadDropzone } from "@/components/training-hub/file-upload-dropzone";
import {
  EmptyPanel,
  PageHeader,
  Pill,
  Section,
} from "@/components/training-hub/page-primitives";
import {
  dismissSyncFailureAction,
  retrySyncFailureAction,
} from "@/app/actions/sync-failure";

export default async function IngestionPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: runs } = await supabase
    .from("ingestion_runs")
    .select("id, source, started_at, finished_at, status, rows_processed, rows_inserted, rows_updated, rows_skipped, rows_unresolved, triggered_by, error_summary")
    .order("started_at", { ascending: false })
    .limit(25);

  const { data: reviewItems } = await supabase
    .from("review_queue")
    .select("id, source, reason, raw_payload, suggested_match_employee_id, suggested_match_score, resolved, created_at")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  const pendingCount = reviewItems?.length ?? 0;
  const runRows = runs ?? [];

  // Outbound writebacks — failures + pending xlsx writes
  const { data: failures } = await supabase
    .from("sync_failures")
    .select("id, kind, target, payload, error, attempts, created_at, last_attempt_at")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: pendingXlsx } = await supabase
    .from("pending_xlsx_writes")
    .select("id, source, action, payload, created_at")
    .is("applied_at", null)
    .order("created_at", { ascending: true })
    .limit(30);

  // Group pending_xlsx_writes by source for a per-source summary
  const xlsxBySource = new Map<string, { count: number; oldest: string | null }>();
  for (const w of pendingXlsx ?? []) {
    const cur = xlsxBySource.get(w.source) ?? { count: 0, oldest: null };
    cur.count += 1;
    if (!cur.oldest || (w.created_at && w.created_at < cur.oldest)) {
      cur.oldest = w.created_at;
    }
    xlsxBySource.set(w.source, cur);
  }
  const XLSX_COMMAND: Record<string, string> = {
    separation_summary: "npm run writeback:separations",
  };
  // Server component runs per-request, so computing "now" once here is fine.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Operations"
        title="Ingestion Console"
        subtitle="Data sync history and unresolved records."
      />

      <Section label="Upload a file">
        <FileUploadDropzone />
      </Section>

      <Section label="Manual sync via CLI">
        <div className="panel p-6 space-y-3">
          <p className="text-sm text-[--ink-soft]">
            Place files in <code className="rounded bg-[--surface-alt] px-1.5 py-0.5 font-mono text-xs">data/sources/</code> and run:
          </p>
          <div className="rounded-md bg-[--surface-alt] p-4 font-mono text-xs text-[--ink-soft] space-y-1">
            <p>npm run ingest:seed &nbsp;&nbsp;&nbsp;# First-time load all sources</p>
            <p>npm run ingest:refresh # Pull Google Sheets (Sources A + B)</p>
            <p>npm run ingest:dry-run # Preview without writing</p>
          </div>
          <p className="text-xs text-[--ink-muted]">Automated sync runs nightly via Vercel cron.</p>
        </div>
      </Section>

      <Section label="Outbound writebacks" hint="Hub edits waiting to land on sheets/xlsx.">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Pending xlsx writes */}
          <div className="panel p-5">
            <p className="caption mb-2">Pending xlsx writes</p>
            {xlsxBySource.size === 0 ? (
              <p className="text-sm text-[--ink-muted]">Nothing queued.</p>
            ) : (
              <ul className="space-y-3">
                {Array.from(xlsxBySource.entries()).map(([source, info]) => {
                  const ageDays = info.oldest
                    ? Math.floor((nowMs - new Date(info.oldest).getTime()) / 86400000)
                    : 0;
                  const stale = ageDays > 7;
                  return (
                    <li key={source} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[--ink]">
                          {info.count} pending · <code className="font-mono text-xs">{source}</code>
                        </span>
                        {stale && <Pill tone="warn">{ageDays}d old</Pill>}
                      </div>
                      {XLSX_COMMAND[source] && (
                        <code className="font-mono text-xs text-[--ink-muted]">
                          {XLSX_COMMAND[source]}
                        </code>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Sync failures (Google Sheet writeback) */}
          <div className="panel p-5">
            <p className="caption mb-2">Sheet writeback failures</p>
            {(failures ?? []).length === 0 ? (
              <p className="text-sm text-[--ink-muted]">No unresolved failures.</p>
            ) : (
              <ul className="space-y-3">
                {(failures ?? []).map((f) => {
                  const payload = f.payload as Record<string, unknown> | null;
                  const label =
                    payload?.employee_id || payload?.last_name || payload?.training_code || f.id;
                  return (
                    <li key={f.id} className="space-y-1 border-b border-[--rule] pb-2 last:border-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="alert">{f.kind}</Pill>
                        <span className="text-sm text-[--ink]">{String(label)}</span>
                        <span className="text-xs text-[--ink-muted]">· attempts {f.attempts}</span>
                      </div>
                      {f.error && (
                        <p className="font-mono text-xs text-[--alert]">{String(f.error).slice(0, 160)}</p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <form action={retrySyncFailureAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            className="text-xs text-[--accent] hover:underline"
                          >
                            Retry
                          </button>
                        </form>
                        <form action={dismissSyncFailureAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            className="text-xs text-[--ink-muted] hover:text-[--ink]"
                          >
                            Dismiss
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section
        label={`Review queue${pendingCount > 0 ? ` · ${pendingCount}` : ""}`}
      >
        {pendingCount === 0 ? (
          <EmptyPanel title="No unresolved items. Ingestion is clean." />
        ) : (
          <div className="panel overflow-x-auto">
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
                  const name = payload
                    ? `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim()
                    : "—";
                  return (
                    <tr key={item.id} className="row-hover border-b border-[--rule] last:border-0">
                      <td className="px-4 py-3 text-[--ink-soft]">{item.source ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Pill tone="warn">{item.reason ?? "unknown"}</Pill>
                      </td>
                      <td className="px-4 py-3 text-[--ink]">{name}</td>
                      <td className="px-4 py-3 tabular text-[--ink-muted]">
                        {item.suggested_match_score != null
                          ? `${Math.round(Number(item.suggested_match_score) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 tabular text-[--ink-muted]">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section label="Recent runs">
        {runRows.length === 0 ? (
          <EmptyPanel title="No ingestion runs yet. Run your first seed to populate the database." />
        ) : (
          <div className="panel overflow-x-auto">
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
                  <tr key={run.id} className="row-hover border-b border-[--rule] last:border-0">
                    <td className="px-4 py-3 tabular text-[--ink-soft]">
                      {run.started_at
                        ? new Date(run.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{run.source}</td>
                    <td className="px-4 py-3">
                      <Pill
                        tone={
                          run.status === "success" ? "success" :
                          run.status === "partial" ? "warn" :
                          run.status === "failed" ? "alert" :
                          "muted"
                        }
                      >
                        {run.status}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 tabular text-right">{run.rows_processed}</td>
                    <td className="px-4 py-3 tabular text-right">{run.rows_inserted}</td>
                    <td className="px-4 py-3 tabular text-right">{run.rows_updated}</td>
                    <td className="px-4 py-3 tabular text-right">{run.rows_unresolved > 0 ? run.rows_unresolved : "—"}</td>
                    <td className="px-4 py-3 text-[--ink-muted]">{run.triggered_by ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
