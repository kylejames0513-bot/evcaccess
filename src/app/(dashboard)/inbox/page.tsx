import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EmptyPanel,
  PageHeader,
  Pill,
  Section,
  SecondaryLink,
  StatCard,
} from "@/components/training-hub/page-primitives";
import {
  dismissSyncFailureAction,
  retrySyncFailureAction,
} from "@/app/actions/sync-failure";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load everything actionable
  const [reviewRows, syncRows, pendingXlsxRows, staleRosters] = await Promise.all([
    supabase
      .from("review_queue")
      .select("id, source, reason, raw_payload, suggested_match_score, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sync_failures")
      .select("id, kind, target, payload, error, attempts, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("pending_xlsx_writes")
      .select("id, source, payload, created_at")
      .is("applied_at", null)
      .order("created_at", { ascending: true })
      .limit(50),
    // Classes in the next 7 days with no attending enrollment
    findStaleRosters(supabase),
  ]);

  const reviewItems = reviewRows.data ?? [];
  const syncItems = syncRows.data ?? [];
  const xlsxItems = pendingXlsxRows.data ?? [];

  const total =
    reviewItems.length + syncItems.length + xlsxItems.length + staleRosters.length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Triage"
        title="Inbox"
        subtitle={
          total === 0
            ? "Zero items. You are caught up."
            : `${total} item${total === 1 ? "" : "s"} need your attention.`
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Review queue"
          value={reviewItems.length}
          href="/review"
          tone={reviewItems.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Sync failures"
          value={syncItems.length}
          tone={syncItems.length > 0 ? "alert" : "default"}
        />
        <StatCard
          label="xlsx pending"
          value={xlsxItems.length}
          tone={xlsxItems.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Classes w/o roster"
          value={staleRosters.length}
          tone={staleRosters.length > 0 ? "warn" : "default"}
        />
      </div>

      {/* Classes needing a roster */}
      <Section label={`Classes this week without a roster · ${staleRosters.length}`}>
        {staleRosters.length === 0 ? (
          <EmptyPanel title="All upcoming classes have attendees." />
        ) : (
          <ul className="space-y-2">
            {staleRosters.map((s) => (
              <li key={s.id} className="panel flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[--ink]">{s.title}</p>
                  <p className="mt-0.5 text-xs text-[--ink-muted]">
                    {s.when} · {s.location ?? "no location"}
                  </p>
                </div>
                <SecondaryLink href={`/classes/${s.id}`}>Build roster</SecondaryLink>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Review queue */}
      <Section label={`Ingestion review · ${reviewItems.length}`}>
        {reviewItems.length === 0 ? (
          <EmptyPanel title="No unresolved names or trainings." />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Source</th>
                  <th className="caption px-4 py-3 text-left">Reason</th>
                  <th className="caption px-4 py-3 text-left">Data</th>
                  <th className="caption px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {reviewItems.map((item) => {
                  const payload = item.raw_payload as Record<string, unknown> | null;
                  const name = payload
                    ? `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim()
                    : "—";
                  return (
                    <tr key={item.id} className="border-b border-[--rule] last:border-0">
                      <td className="px-4 py-3 text-[--ink-muted]">{item.source ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Pill tone="warn">{item.reason ?? "unknown"}</Pill>
                      </td>
                      <td className="px-4 py-3 text-[--ink]">{name || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href="/review"
                          className="text-sm text-[--accent] hover:underline"
                        >
                          Resolve →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Sync failures */}
      <Section label={`Sheet writeback failures · ${syncItems.length}`}>
        {syncItems.length === 0 ? (
          <EmptyPanel title="All writebacks landed." />
        ) : (
          <ul className="space-y-2">
            {syncItems.map((f) => {
              const payload = f.payload as Record<string, unknown> | null;
              const label =
                payload?.employee_id || payload?.last_name || payload?.training_code || f.id;
              return (
                <li key={f.id} className="panel space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="alert">{f.kind}</Pill>
                    <span className="text-sm font-medium text-[--ink]">{String(label)}</span>
                    <span className="text-xs text-[--ink-muted]">attempts {f.attempts}</span>
                  </div>
                  {f.error && (
                    <p className="font-mono text-xs text-[--alert]">{String(f.error).slice(0, 200)}</p>
                  )}
                  <div className="flex gap-3">
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
      </Section>

      {/* Pending xlsx */}
      <Section label={`Pending xlsx writes · ${xlsxItems.length}`}>
        {xlsxItems.length === 0 ? (
          <EmptyPanel title="Nothing queued for local xlsx." />
        ) : (
          <div className="panel p-5 text-sm">
            <p className="text-[--ink]">
              {xlsxItems.length} row{xlsxItems.length === 1 ? "" : "s"} queued for local
              Excel writeback.
            </p>
            <p className="mt-2 text-xs text-[--ink-muted]">
              Run locally: <code className="font-mono">npm run writeback:separations</code>
            </p>
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-xs text-[--ink-soft]">
              {xlsxItems.map((x) => {
                const p = x.payload as Record<string, unknown> | null;
                return (
                  <li key={x.id} className="tabular">
                    {String(p?.separation_date ?? "")} ·{" "}
                    {String(p?.legal_name ?? p?.employee_id ?? x.id)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

// --------- helpers ----------------------------------------------------------

type StaleRoster = { id: string; title: string; when: string; location: string | null };

async function findStaleRosters(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<StaleRoster[]> {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);

  const { data: rows } = await supabase
    .from("sessions")
    .select("id, scheduled_start, location, training_id, status")
    .gte("scheduled_start", now.toISOString())
    .lte("scheduled_start", in7.toISOString())
    .eq("status", "scheduled")
    .order("scheduled_start", { ascending: true })
    .limit(20);

  const list = rows ?? [];
  if (list.length === 0) return [];

  const ids = list.map((r) => r.id);
  const { data: enrolls } = await supabase
    .from("session_enrollments")
    .select("session_id, status")
    .in("session_id", ids);
  const attending = new Map<string, number>();
  for (const e of enrolls ?? []) {
    if (["enrolled", "confirmed", "attended"].includes(e.status ?? "enrolled")) {
      attending.set(e.session_id, (attending.get(e.session_id) ?? 0) + 1);
    }
  }

  const tids = [...new Set(list.map((s) => s.training_id).filter((v): v is string => Boolean(v)))];
  const { data: trs } =
    tids.length > 0
      ? await supabase.from("trainings").select("id, title").in("id", tids)
      : { data: [] as { id: string; title: string }[] };
  const tMap = new Map((trs ?? []).map((t) => [t.id, t.title]));

  return list
    .filter((s) => (attending.get(s.id) ?? 0) === 0)
    .map((s) => {
      const d = s.scheduled_start ? new Date(s.scheduled_start) : null;
      return {
        id: s.id,
        title: tMap.get(s.training_id ?? "") ?? "Class",
        when: d
          ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
            " " +
            d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "—",
        location: s.location,
      };
    });
}
