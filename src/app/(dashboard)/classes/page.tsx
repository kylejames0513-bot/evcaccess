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

export const dynamic = "force-dynamic";

type FilterValue = "upcoming" | "past" | "all";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter: FilterValue =
    params.filter === "past" || params.filter === "all" ? params.filter : "upcoming";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("sessions")
    .select(
      "id, scheduled_start, scheduled_end, status, location, trainer_name, capacity, training_id, session_kind, title",
    )
    .order("scheduled_start", { ascending: filter !== "past" })
    .limit(60);

  const todayIso = new Date().toISOString();
  if (filter === "upcoming") {
    query = query.or(`scheduled_start.gte.${todayIso},scheduled_start.is.null`);
  } else if (filter === "past") {
    query = query.lt("scheduled_start", todayIso);
  }

  const { data: rows } = await query;
  const list = rows ?? [];

  const tids = [...new Set(list.map((r) => r.training_id).filter((v): v is string => Boolean(v)))];
  const { data: trows } =
    tids.length > 0
      ? await supabase.from("trainings").select("id, title, code").in("id", tids)
      : { data: [] as { id: string; title: string; code: string }[] };
  const tMap = new Map((trows ?? []).map((t) => [t.id, t]));

  // Enrollment counts in one go
  const sessionIds = list.map((s) => s.id);
  const enrollCount = new Map<string, { total: number; attending: number }>();
  if (sessionIds.length > 0) {
    const { data: enrolls } = await supabase
      .from("session_enrollments")
      .select("session_id, status")
      .in("session_id", sessionIds);
    for (const row of enrolls ?? []) {
      const cur = enrollCount.get(row.session_id) ?? { total: 0, attending: 0 };
      cur.total += 1;
      if (["enrolled", "confirmed", "attended"].includes(row.status ?? "enrolled")) {
        cur.attending += 1;
      }
      enrollCount.set(row.session_id, cur);
    }
  }

  // Summary stats for header
  const nowIso = new Date().toISOString();
  const upcoming = list.filter((s) => s.scheduled_start && s.scheduled_start >= nowIso && s.status === "scheduled").length;
  const inProgress = list.filter((s) => s.status === "in_progress").length;
  const needsRoster = list.filter((s) => {
    const cnt = enrollCount.get(s.id)?.attending ?? 0;
    return (
      s.status === "scheduled" &&
      s.scheduled_start &&
      s.scheduled_start >= nowIso &&
      cnt === 0
    );
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Training"
        title="Classes"
        subtitle="Schedule sessions, build rosters, finalize attendance."
        actions={<PrimaryLink href="/classes/new">Schedule class</PrimaryLink>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Showing" value={list.length} />
        <StatCard label="Upcoming" value={upcoming} />
        <StatCard label="In progress" value={inProgress} tone={inProgress > 0 ? "warn" : "default"} />
        <StatCard label="Needs roster" value={needsRoster} tone={needsRoster > 0 ? "warn" : "default"} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterPill href="/classes?filter=upcoming" active={filter === "upcoming"} label="Upcoming" />
        <FilterPill href="/classes?filter=past" active={filter === "past"} label="Past" />
        <FilterPill href="/classes?filter=all" active={filter === "all"} label="All" />
      </div>

      {list.length === 0 ? (
        <EmptyPanel
          title={filter === "past" ? "No past sessions yet." : "No sessions on the books."}
          hint="Schedule one to build a roster, run the day, and send the memo."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">When</th>
                <th className="caption px-4 py-3 text-left">Training</th>
                <th className="caption px-4 py-3 text-left">Roster</th>
                <th className="caption px-4 py-3 text-left">Location</th>
                <th className="caption px-4 py-3 text-left">Trainer</th>
                <th className="caption px-4 py-3 text-left">Status</th>
                <th className="caption px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const tr = tMap.get(c.training_id ?? "");
                const counts = enrollCount.get(c.id) ?? { total: 0, attending: 0 };
                const needs =
                  c.status === "scheduled" &&
                  c.scheduled_start &&
                  c.scheduled_start >= nowIso &&
                  counts.attending === 0;
                return (
                  <tr key={c.id} className="row-hover border-b border-[--rule] last:border-0">
                    <td className="px-4 py-3 tabular text-[--ink]">
                      {formatWhen(c.scheduled_start, c.scheduled_end)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[--ink]">{c.title ?? tr?.title ?? "Session"}</span>
                      {tr?.code && <span className="ml-2 font-mono text-xs text-[--ink-muted]">{tr.code}</span>}
                      {c.session_kind === "orientation" && (
                        <Pill tone="default" className="ml-2">orientation</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular text-[--ink-soft]">
                      {counts.attending}
                      {c.capacity ? ` / ${c.capacity}` : ""}
                      {needs && <span className="ml-2"><Pill tone="warn">Needs roster</Pill></span>}
                    </td>
                    <td className="px-4 py-3 text-[--ink-soft]">{c.location ?? "—"}</td>
                    <td className="px-4 py-3 text-[--ink-soft]">{c.trainer_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Pill
                        tone={
                          c.status === "scheduled" ? "default"
                          : c.status === "in_progress" ? "warn"
                          : c.status === "completed" ? "success"
                          : "muted"
                        }
                      >
                        {c.status}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/classes/${c.id}`} className="text-sm text-[--accent] hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
        active
          ? "bg-[--accent-soft] text-[--accent]"
          : "text-[--ink-muted] hover:bg-[--surface-alt] hover:text-[--ink]",
      )}
    >
      {label}
    </Link>
  );
}

function formatWhen(start: string | null, end: string | null): string {
  if (!start) return "Unscheduled";
  const d = new Date(start);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const opt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const timeStr = d.toLocaleTimeString("en-US", opt);
  if (!end) return `${dateStr} · ${timeStr}`;
  const e = new Date(end);
  const endStr = e.toLocaleTimeString("en-US", opt);
  return `${dateStr} · ${timeStr}–${endStr}`;
}
