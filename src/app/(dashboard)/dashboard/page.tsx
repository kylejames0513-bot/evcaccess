import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PageHeader,
  PrimaryLink,
  SecondaryLink,
  Section,
  StatCard,
  Pill,
} from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

type FeedItem = {
  id: string;
  when: string;
  whenSort: number;
  title: string;
  hint?: string;
  href: string;
  tag: "class" | "new_hire" | "compliance" | "sync" | "review";
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "there";

  // --- Counts --------------------------------------------------------------
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);

  const [
    empTotal,
    trainingsTotal,
    activeNewHires,
    pendingReview,
    pendingXlsx,
    syncFailures,
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("trainings").select("id", { count: "exact", head: true }).eq("active", true),
    supabase
      .from("new_hires")
      .select("id", { count: "exact", head: true })
      .not("stage", "in", '("complete","withdrew","terminated_in_probation")'),
    supabase.from("review_queue").select("id", { count: "exact", head: true }).eq("resolved", false),
    supabase
      .from("pending_xlsx_writes")
      .select("id", { count: "exact", head: true })
      .is("applied_at", null),
    supabase.from("sync_failures").select("id", { count: "exact", head: true }).eq("resolved", false),
  ]);

  // --- Upcoming classes feed ----------------------------------------------
  const { data: upcomingClasses } = await supabase
    .from("sessions")
    .select("id, scheduled_start, status, location, trainer_name, training_id")
    .gte("scheduled_start", now.toISOString())
    .lte("scheduled_start", in7.toISOString())
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_start", { ascending: true })
    .limit(10);

  const upcomingTids = (upcomingClasses ?? [])
    .map((s) => s.training_id)
    .filter((v): v is string => Boolean(v));
  const trainingTitles = new Map<string, { title: string; code: string }>();
  if (upcomingTids.length > 0) {
    const { data } = await supabase
      .from("trainings")
      .select("id, title, code")
      .in("id", upcomingTids);
    for (const t of data ?? []) trainingTitles.set(t.id, t);
  }

  // --- Overdue compliance (sample a handful) -------------------------------
  const { data: overdueRows } = await supabase
    .from("vw_compliance_status")
    .select("employee_id, legal_first_name, legal_last_name, training_code, training_title, expires_on, days_until_expiry, compliance_status")
    .eq("compliance_status", "overdue")
    .order("days_until_expiry", { ascending: true })
    .limit(5);

  // --- Build feed ----------------------------------------------------------
  const feed: FeedItem[] = [];

  for (const s of upcomingClasses ?? []) {
    if (!s.scheduled_start) continue;
    const t = trainingTitles.get(s.training_id ?? "");
    const d = new Date(s.scheduled_start);
    feed.push({
      id: s.id,
      when: formatFeedWhen(d),
      whenSort: d.getTime(),
      title: `${t?.title ?? "Class"}${t?.code ? ` · ${t.code}` : ""}`,
      hint: [s.location ?? undefined, s.trainer_name ? `Trainer: ${s.trainer_name}` : undefined]
        .filter(Boolean)
        .join(" · "),
      href: `/classes/${s.id}`,
      tag: "class",
    });
  }

  for (const o of overdueRows ?? []) {
    feed.push({
      id: `${o.employee_id}|${o.training_code}`,
      when: `${Math.abs(o.days_until_expiry ?? 0)} days overdue`,
      whenSort: now.getTime() - 86400000,
      title: `${o.legal_last_name}, ${o.legal_first_name} — ${o.training_title}`,
      hint: o.expires_on ? `Expired ${o.expires_on}` : undefined,
      href: `/employees/${o.employee_id}`,
      tag: "compliance",
    });
  }

  if ((pendingReview.count ?? 0) > 0) {
    feed.push({
      id: "review-queue",
      when: "Needs triage",
      whenSort: now.getTime() - 86400001,
      title: `${pendingReview.count} ingestion review item${pendingReview.count === 1 ? "" : "s"}`,
      hint: "Names / trainings the matcher couldn't resolve.",
      href: "/review",
      tag: "review",
    });
  }

  if ((syncFailures.count ?? 0) > 0) {
    feed.push({
      id: "sync-failures",
      when: "Sheet sync failing",
      whenSort: now.getTime() - 86400002,
      title: `${syncFailures.count} writeback${syncFailures.count === 1 ? "" : "s"} failed`,
      hint: "Open /ingestion to retry or dismiss.",
      href: "/ingestion",
      tag: "sync",
    });
  }

  if ((pendingXlsx.count ?? 0) > 0) {
    feed.push({
      id: "pending-xlsx",
      when: "xlsx writeback pending",
      whenSort: now.getTime() - 86400003,
      title: `${pendingXlsx.count} row${pendingXlsx.count === 1 ? "" : "s"} queued for xlsx`,
      hint: "Run `npm run writeback:separations` locally.",
      href: "/ingestion",
      tag: "sync",
    });
  }

  feed.sort((a, b) => b.whenSort - a.whenSort); // most urgent first

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={today()}
        title={`${greeting()}, ${firstName}.`}
        subtitle={
          feed.length === 0
            ? "Nothing urgent. A rare quiet day."
            : buildSummary(upcomingClasses?.length ?? 0, activeNewHires.count ?? 0, overdueRows?.length ?? 0)
        }
      />

      {/* Quick actions strip */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        <PrimaryLink href="/classes/new" className="shrink-0 whitespace-nowrap">
          Schedule class
        </PrimaryLink>
        <SecondaryLink href="/new-hires/new" className="shrink-0 whitespace-nowrap">
          Start a new hire
        </SecondaryLink>
        <SecondaryLink href="/separations/new" className="shrink-0 whitespace-nowrap">
          Log separation
        </SecondaryLink>
        <SecondaryLink href="/employees" className="shrink-0 whitespace-nowrap">
          Find an employee
        </SecondaryLink>
      </div>

      {/* Two-column workspace */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Feed */}
        <Section label="Today & this week">
          {feed.length === 0 ? (
            <div className="panel p-6 text-sm italic text-[--ink-muted]">
              Nothing on the calendar. <Link href="/classes/new" className="text-[--accent] hover:underline">Schedule a class</Link> or <Link href="/new-hires" className="text-[--accent] hover:underline">check on new hires</Link>.
            </div>
          ) : (
            <ul className="space-y-2">
              {feed.map((f) => (
                <li key={f.id} className="panel flex items-start gap-3 p-4">
                  <FeedTag tag={f.tag} />
                  <Link href={f.href} className="min-w-0 flex-1 hover:text-[--accent]">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-[--ink]">{f.title}</p>
                      <span className="whitespace-nowrap text-xs text-[--ink-muted]">{f.when}</span>
                    </div>
                    {f.hint && (
                      <p className="mt-0.5 truncate text-xs text-[--ink-muted]">{f.hint}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Right rail */}
        <div className="space-y-6">
          <Section label="At a glance">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Employees" value={empTotal.count ?? 0} href="/employees" />
              <StatCard label="Trainings" value={trainingsTotal.count ?? 0} href="/trainings" />
              <StatCard label="New hires" value={activeNewHires.count ?? 0} href="/new-hires" />
              <StatCard
                label="To review"
                value={pendingReview.count ?? 0}
                href="/inbox"
                tone={(pendingReview.count ?? 0) > 0 ? "warn" : "default"}
              />
            </div>
          </Section>

          <Section label="Sync health">
            <div className="panel space-y-2 p-5 text-sm">
              <SyncDot
                label="Google Sheet writebacks"
                count={syncFailures.count ?? 0}
                href="/ingestion"
              />
              <SyncDot
                label="Pending xlsx writes"
                count={pendingXlsx.count ?? 0}
                href="/ingestion"
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function formatFeedWhen(d: Date): string {
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const opt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (isToday) return `Today, ${d.toLocaleTimeString("en-US", opt)}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow, ${d.toLocaleTimeString("en-US", opt)}`;
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    `, ${d.toLocaleTimeString("en-US", opt)}`;
}

function buildSummary(classes: number, hires: number, overdue: number): React.ReactNode {
  const parts: string[] = [];
  if (classes > 0) parts.push(`${classes} class${classes === 1 ? "" : "es"} this week`);
  if (hires > 0) parts.push(`${hires} new hire${hires === 1 ? "" : "s"} in progress`);
  if (overdue > 0) parts.push(`${overdue} overdue compliance item${overdue === 1 ? "" : "s"}`);
  if (parts.length === 0) return <span className="italic">Nothing urgent. A rare quiet day.</span>;
  return parts.join(" · ");
}

function FeedTag({ tag }: { tag: FeedItem["tag"] }) {
  const map: Record<FeedItem["tag"], { label: string; tone: "default" | "success" | "warn" | "alert" | "muted" }> = {
    class: { label: "Class", tone: "default" },
    new_hire: { label: "New hire", tone: "default" },
    compliance: { label: "Overdue", tone: "alert" },
    sync: { label: "Sync", tone: "warn" },
    review: { label: "Review", tone: "warn" },
  };
  const c = map[tag];
  return (
    <Pill tone={c.tone} className="mt-0.5 shrink-0">
      {c.label}
    </Pill>
  );
}

function SyncDot({ label, count, href }: { label: string; count: number; href: string }) {
  const color = count === 0 ? "bg-[--success]" : count > 5 ? "bg-[--alert]" : "bg-[--warn]";
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-1 py-1 hover:bg-[--surface-alt]"
    >
      <span className="flex items-center gap-2 text-[--ink-soft]">
        <span className={`size-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="tabular text-[--ink-muted]">{count}</span>
    </Link>
  );
}
