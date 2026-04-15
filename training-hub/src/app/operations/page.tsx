"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  UserCheck,
  Upload,
  UserPlus,
  BarChart3,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  ChevronRight,
  BookOpen,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { ROSTER_AUTOMATION_FREEZE_DAYS } from "@/lib/training-constants";

const GITHUB_REPO_TREE = "https://github.com/kylejames0513-bot/evcaccess/tree/main";

type NhRow = {
  id: string;
  sheet: string;
  row_number: number;
  last_name: string;
  first_name: string;
  hire_date: string;
  notes: string | null;
  created_at?: string;
};

type SessionFillRow = {
  session_id: string;
  training_name: string;
  session_date: string;
  start_time: string | null;
  enrolled: number;
  capacity: number;
  fill_ratio: number;
  needs_attention: boolean;
  days_until_session: number;
  roster_manual_lock: boolean;
  auto_roster_lock_14d: boolean;
  roster_automation_locked: boolean;
};

type SessionFillPayload = {
  sessions: SessionFillRow[];
  totals: {
    session_count: number;
    underfilled_count: number;
    total_capacity: number;
    total_enrolled: number;
  };
};

type SepRow = {
  id: string;
  fy_sheet: string;
  row_number: number;
  last_name: string;
  first_name: string;
  date_of_separation: string;
  sync_status: string | null;
  created_at?: string;
};

const dailyLinks = [
  {
    href: "/attendance",
    title: "Attendance",
    desc: "Session check-in, no-shows, and direct completions into Supabase.",
    icon: UserCheck,
  },
  {
    href: "/imports",
    title: "Imports (Merged Sheet)",
    desc: "Upload Paylocity / PHS / Access / sign-in shaped data—preview, then commit to the roster.",
    icon: Upload,
  },
  {
    href: "/new-hires",
    title: "New Hire Training",
    desc: "90-day onboarding progress from live employee + training records.",
    icon: UserPlus,
  },
  {
    href: "/reports",
    title: "Separation Summary",
    desc: "Turnover and separation reporting from the same roster in Supabase.",
    icon: BarChart3,
  },
  {
    href: "/schedule",
    title: "Schedule",
    desc: "Training sessions your team enrolls in and takes attendance on.",
    icon: CalendarPlus,
  },
  {
    href: "/compliance",
    title: "Compliance",
    desc: "Required training status across active employees.",
    icon: ClipboardCheck,
  },
];

const auditLinks = [
  { href: "/tracker/new-hires", label: "New Hire Workbook (Excel)", icon: ClipboardList },
  { href: "/tracker/separations", label: "Separation Workbook (Excel)", icon: BarChart3 },
];

const rootWorkbooks = [
  {
    filename: "Monthly New Hire Tracker.xlsm",
    githubHref: `${GITHUB_REPO_TREE}/Monthly%20New%20Hire%20Tracker.xlsm`,
    hubHref: "/tracker/new-hires",
    hubLabel: "Open tracker rows in hub",
    blurb: "VBA pushes rows to the hub; audit rows mirror Excel when sheet + row number are sent.",
    sync: "POST /api/sync/new-hires · POST /api/sync/training-status",
  },
  {
    filename: "FY Separation Summary (3).xlsx",
    githubHref: `${GITHUB_REPO_TREE}/FY%20Separation%20Summary%20(3).xlsx`,
    hubHref: "/tracker/separations",
    hubLabel: "Open tracker rows in hub",
    blurb: "VBA pushes separations and uses roster endpoints for hire-date backfill. Filename may differ from older copies—match the file HR ships.",
    sync: "POST /api/sync/separations · GET /api/sync/roster",
  },
  {
    filename: "EVC_Attendance_Tracker.xlsx",
    githubHref: `${GITHUB_REPO_TREE}/EVC_Attendance_Tracker.xlsx`,
    hubHref: "/attendance",
    hubLabel: "Open hub attendance",
    blurb:
      "Not connected to token sync. Strategy: hub /attendance is canonical for session data; this workbook is legacy or local reporting unless product defines otherwise.",
    sync: "None (no /api/sync/*)",
  },
];

export default function OperationsPage() {
  const {
    data: fillSummary,
    loading: fillLoading,
    error: fillError,
  } = useFetch<SessionFillPayload>("/api/session-fill-summary?horizon=60");
  const [nh, setNh] = useState<NhRow[]>([]);
  const [sep, setSep] = useState<SepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/tracker-rows/new-hires"),
        fetch("/api/tracker-rows/separations"),
      ]);
      const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
      if (!r1.ok) throw new Error(j1.error || "Failed to load new hire audit");
      if (!r2.ok) throw new Error(j2.error || "Failed to load separation audit");
      const nhRows = (j1.rows ?? []) as NhRow[];
      const sepRows = (j2.rows ?? []) as SepRow[];
      const byTime = (a: { created_at?: string }, b: { created_at?: string }) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? "");
      setNh([...nhRows].sort(byTime).slice(0, 8));
      setSep([...sepRows].sort(byTime).slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Today / Operations</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              One place for daily HR training work. Supabase is the source of truth—Excel macros and the merged sheet feed
              into the same hub flows below.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Upcoming session fill (60 days)</h2>
          <Link
            href="/schedule"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
          >
            Schedule
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          Scheduled sessions in the next 60 days. Rows below 80% enrolled are flagged for top-off. Classes dated within{" "}
          <strong>{ROSTER_AUTOMATION_FREEZE_DAYS} days</strong> are not auto-pruned or auto-filled. You can also lock any
          session from <strong>Schedule → Edit</strong> (prestaged dates). Weekly rhythm:{" "}
          <code className="text-[11px] bg-slate-100 px-1 rounded">training-hub/docs/operating-cadence-8-weeks.md</code>.
        </p>
        {fillLoading && <Loading message="Loading session fill…" />}
        {fillError && <ErrorState message={fillError} />}
        {!fillLoading && !fillError && fillSummary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 py-2 px-2">
                <p className="text-lg font-bold text-slate-900">{fillSummary.totals.session_count}</p>
                <p className="text-[11px] text-slate-500">Sessions</p>
              </div>
              <div className="rounded-lg bg-amber-50 py-2 px-2">
                <p className="text-lg font-bold text-amber-800">{fillSummary.totals.underfilled_count}</p>
                <p className="text-[11px] text-amber-700">Below 80% fill</p>
              </div>
              <div className="rounded-lg bg-slate-50 py-2 px-2">
                <p className="text-lg font-bold text-slate-900">{fillSummary.totals.total_enrolled}</p>
                <p className="text-[11px] text-slate-500">Enrolled seats</p>
              </div>
              <div className="rounded-lg bg-slate-50 py-2 px-2">
                <p className="text-lg font-bold text-slate-900">{fillSummary.totals.total_capacity}</p>
                <p className="text-[11px] text-slate-500">Total capacity</p>
              </div>
            </div>
            {fillSummary.sessions.filter((s) => s.needs_attention).length > 0 && (
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg max-h-48 overflow-y-auto text-sm">
                {fillSummary.sessions
                  .filter((s) => s.needs_attention)
                  .slice(0, 12)
                  .map((s) => (
                    <li key={s.session_id} className="px-3 py-2 flex justify-between gap-2">
                      <span className="text-slate-800 truncate">
                        {s.training_name} · {s.session_date}
                        {s.roster_automation_locked && (
                          <span className="text-slate-400 text-xs ml-1">
                            · {s.roster_manual_lock && !s.auto_roster_lock_14d
                              ? "manual lock"
                              : s.auto_roster_lock_14d && !s.roster_manual_lock
                                ? "2-week window"
                                : "locked"}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate-500 shrink-0">
                        {s.enrolled}/{s.capacity} ({Math.round(s.fill_ratio * 100)}%)
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {fillSummary.totals.session_count === 0 && (
              <p className="text-sm text-slate-600">No scheduled sessions in the next 60 days.</p>
            )}
            {fillSummary.totals.session_count > 0 && fillSummary.sessions.filter((s) => s.needs_attention).length === 0 && (
              <p className="text-sm text-slate-600">All scheduled sessions in this window are at least 80% full.</p>
            )}
            {(() => {
              const soon = fillSummary.sessions.filter(
                (s) => s.days_until_session >= 0 && s.days_until_session <= ROSTER_AUTOMATION_FREEZE_DAYS
              );
              if (soon.length === 0) return null;
              return (
                <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3 space-y-2">
                  <p className="text-sm font-semibold text-slate-800">
                    Two-week notices (next {ROSTER_AUTOMATION_FREEZE_DAYS} calendar days)
                  </p>
                  <p className="text-xs text-slate-600">
                    Use this list for reminders. These session dates are excluded from automatic roster prune and from
                    auto-fill — change enrollments only by hand on Schedule.
                  </p>
                  <ul className="divide-y divide-blue-100 border border-blue-100 rounded-lg bg-white max-h-52 overflow-y-auto text-sm">
                    {soon.map((s) => (
                      <li key={s.session_id} className="px-3 py-2 flex justify-between gap-2">
                        <span className="text-slate-800 truncate">
                          {s.training_name} · {s.session_date}
                          <span className="text-slate-400 text-xs ml-1">
                            ({s.days_until_session === 0 ? "today" : `in ${s.days_until_session}d`})
                          </span>
                        </span>
                        <span className="text-xs text-slate-500 shrink-0 text-right">
                          {s.enrolled}/{s.capacity}
                          {s.needs_attention ? " · needs fill" : ""}
                          {s.roster_manual_lock ? " · manual lock" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-slate-500 flex items-center gap-2 tracking-wide">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel Files on GitHub (main)
        </h2>
        <p className="text-sm text-slate-600">
          These workbooks live at the{" "}
          <a
            href={GITHUB_REPO_TREE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
          >
            evcaccess repo root
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          . Open a local copy from your clone, or use GitHub to download the tracked file.
        </p>
        <div className="grid gap-3 sm:grid-cols-1">
          {rootWorkbooks.map((w) => (
            <div
              key={w.filename}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{w.filename}</p>
                <p className="text-sm text-slate-600 mt-1 leading-snug">{w.blurb}</p>
                <p className="text-xs text-slate-500 mt-2 font-mono">{w.sync}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0 sm:items-end">
                <Link
                  href={w.hubHref}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium px-3 py-2 hover:bg-blue-700"
                >
                  {w.hubLabel}
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <a
                  href={w.githubHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  View on GitHub
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-slate-500 flex items-center gap-2 tracking-wide">
          <BookOpen className="h-3.5 w-3.5" />
          Daily Tools
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {dailyLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-50 shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 shrink-0" />
                  </div>
                  <p className="text-sm text-slate-500 mt-1 leading-snug">{item.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-slate-500 tracking-wide">Excel Workbook Audit (Reconcile)</h2>
        <p className="text-sm text-slate-600">
          When the New Hire or Separation workbook sends <code className="text-xs bg-slate-100 px-1 rounded">sheet</code>{" "}
          + <code className="text-xs bg-slate-100 px-1 rounded">row_number</code>, the hub records a row for HR to cross-check against
          Supabase. This is the lightweight &quot;approve by review&quot; path—see docs for a future gated queue if you need hard blocks before
          writes.
        </p>
        <div className="flex flex-wrap gap-2">
          {auditLinks.map((l) => {
            const I = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <I className="h-4 w-4 text-blue-600" />
                {l.label}
              </Link>
            );
          })}
          <Link
            href="/review"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Review Queue (Imports)
          </Link>
          <Link
            href="/roster-queue"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Roster queue (gated sync)
          </Link>
        </div>
      </section>

      {loading && <Loading message="Loading recent audit rows…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Recent New Hire Sync Rows</div>
            <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-sm">
              {nh.length === 0 ? (
                <li className="px-4 py-6 text-slate-500 text-center">No audit rows yet.</li>
              ) : (
                nh.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 flex justify-between gap-2">
                    <span className="text-slate-700 truncate">
                      {r.last_name}, {r.first_name}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {r.sheet} #{r.row_number}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Recent Separation Sync Rows</div>
            <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-sm">
              {sep.length === 0 ? (
                <li className="px-4 py-6 text-slate-500 text-center">No audit rows yet.</li>
              ) : (
                sep.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 flex justify-between gap-2">
                    <span className="text-slate-700 truncate">
                      {r.last_name}, {r.first_name}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {r.sync_status ?? "—"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
