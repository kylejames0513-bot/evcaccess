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
} from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";

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
    title: "Imports (merged sheet)",
    desc: "Upload Paylocity / PHS / Access / sign-in shaped data—preview, then commit to the roster.",
    icon: Upload,
  },
  {
    href: "/new-hires",
    title: "New hire training",
    desc: "90-day onboarding progress from live employee + training records.",
    icon: UserPlus,
  },
  {
    href: "/reports",
    title: "Separation summary",
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
  { href: "/tracker/new-hires", label: "New hire workbook audit rows", icon: ClipboardList },
  { href: "/tracker/separations", label: "Separation workbook audit rows", icon: BarChart3 },
];

export default function OperationsPage() {
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

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5" />
          Daily tools
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Excel sync audit (reconcile)</h2>
        <p className="text-sm text-slate-600">
          When the Monthly New Hire Tracker or FY Separation workbook sends <code className="text-xs bg-slate-100 px-1 rounded">sheet</code>{" "}
          + <code className="text-xs bg-slate-100 px-1 rounded">row_number</code>, the hub records a row here for HR to cross-check against
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
            Review queue (imports)
          </Link>
        </div>
      </section>

      {loading && <Loading message="Loading recent audit rows…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Recent new hire sync rows</div>
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
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Recent separation sync rows</div>
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
