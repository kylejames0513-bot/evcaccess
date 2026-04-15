"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CalendarDays,
  ClipboardCheck,
  UserPlus,
  UserMinus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Briefcase,
  Workflow,
} from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { Loading, ErrorState } from "@/components/ui/DataState";

interface HubOverviewData {
  compliance: {
    totalRows: number;
    current: number;
    expiringSoon: number;
    expired: number;
    needed: number;
    excused: number;
  };
  sessions: {
    upcomingCount: number;
    nextDate: string | null;
  };
  newHires: {
    count: number;
    avgProgressPct: number;
    atRiskCount: number;
  };
  separations: {
    totalSeparated: number;
    separatedLast30Days: number;
  };
  sync: {
    lastSyncAt: string | null;
    stale: boolean;
  };
  highlights: {
    topComplianceRisk: Array<{
      employee: string;
      training: string;
      status: string;
      expirationDate: string | null;
    }>;
    nextSessions: Array<{
      id: string;
      training: string;
      sessionDate: string;
      startTime: string | null;
      enrolledCount: number;
      capacity: number;
    }>;
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusTone(status: string): string {
  if (status === "expired") return "text-red-700 bg-red-50 border-red-200";
  if (status === "expiring_soon") return "text-amber-700 bg-amber-50 border-amber-200";
  if (status === "needed") return "text-blue-700 bg-blue-50 border-blue-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error } = useFetch<HubOverviewData>(
    `/api/hub-overview?r=${refreshKey}`
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((prev) => prev + 1);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <Loading message="Loading Hub Overview…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const compliancePct =
    data.compliance.totalRows > 0
      ? Math.round((data.compliance.current / data.compliance.totalRows) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Training Hub Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Core dashboard for compliance, sessions, onboarding, separations, and sync health.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={ClipboardCheck}
          label="Compliance"
          value={`${compliancePct}%`}
          sub={`${data.compliance.current}/${data.compliance.totalRows} current`}
          tone="blue"
        />
        <StatCard
          icon={CalendarDays}
          label="Upcoming Sessions"
          value={String(data.sessions.upcomingCount)}
          sub={data.sessions.nextDate ? `Next: ${formatDate(data.sessions.nextDate)}` : "No sessions"}
          tone="violet"
        />
        <StatCard
          icon={UserPlus}
          label="New Hire Tracker"
          value={String(data.newHires.count)}
          sub={`${data.newHires.avgProgressPct}% avg progress`}
          tone="emerald"
        />
        <StatCard
          icon={UserMinus}
          label="Separations (30d)"
          value={String(data.separations.separatedLast30Days)}
          sub={`${data.separations.totalSeparated} total`}
          tone="amber"
        />
        <StatCard
          icon={ShieldCheck}
          label="Sync Health"
          value={data.sync.stale ? "Stale" : "Healthy"}
          sub={formatDateTime(data.sync.lastSyncAt)}
          tone={data.sync.stale ? "red" : "green"}
        />
      </div>

      <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Daily Operations</h2>
              <p className="text-sm text-blue-100 mt-1 max-w-xl">
                Attendance, merged-sheet imports, new hire and separation views, schedule, and Excel workbook audit rows—everything
                routes through this hub into Supabase.
              </p>
            </div>
          </div>
          <Link
            href="/operations"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 shrink-0"
          >
            Open Today / Operations
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          {[
            { href: "/attendance", label: "Attendance" },
            { href: "/imports", label: "Imports" },
            { href: "/new-hires", label: "New Hire Training" },
            { href: "/reports", label: "Separation Summary" },
            { href: "/schedule", label: "Schedule" },
            { href: "/compliance", label: "Compliance" },
          ].map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-medium"
            >
              {q.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Workflow className="h-4 w-4 text-blue-600" />
              Workflow Hub
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Use workflow-first views to run New Hire and Separation operations with fewer tab switches.
            </p>
          </div>
          <Link
            href="/workflows"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open Workflow Hub
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/workflows/new-hire"
            className="group rounded-xl border border-slate-200 p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900">New Hire Workflow</p>
            <p className="text-xs text-slate-500 mt-1">
              Intake status, imports/review queue, and workbook row audit in one page.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
              Open
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/workflows/separation"
            className="group rounded-xl border border-slate-200 p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900">Separation Workflow</p>
            <p className="text-xs text-slate-500 mt-1">
              Separation audit rows, queue checks, and reporting shortcuts aligned to the workbook process.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
              Open
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Compliance Attention
            </h2>
            <Link
              href="/compliance"
              className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Open compliance
              <ChevronRight className="h-3 w-3" />
            </Link>
          </header>
          {data.highlights.topComplianceRisk.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No urgent compliance issues</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.highlights.topComplianceRisk.map((item) => (
                <div key={`${item.employee}-${item.training}`} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.employee}</p>
                      <p className="text-xs text-slate-500">{item.training}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border font-medium ${statusTone(item.status)}`}
                    >
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  {item.expirationDate && (
                    <p className="text-[11px] text-slate-400 mt-1">Expires: {formatDate(item.expirationDate)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-500" />
              Upcoming Sessions
            </h2>
            <Link
              href="/schedule"
              className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Open schedule
              <ChevronRight className="h-3 w-3" />
            </Link>
          </header>
          {data.highlights.nextSessions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No scheduled sessions.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.highlights.nextSessions.map((session) => (
                <div key={session.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-900">{session.training}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatDate(session.sessionDate)}
                    {session.startTime ? ` at ${session.startTime}` : ""}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Enrolled {session.enrolledCount}/{session.capacity}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "violet" | "emerald" | "amber" | "green" | "red";
}) {
  const styles: Record<string, { icon: string; value: string }> = {
    blue: { icon: "bg-blue-50 text-blue-600", value: "text-blue-700" },
    violet: { icon: "bg-violet-50 text-violet-600", value: "text-violet-700" },
    emerald: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700" },
    amber: { icon: "bg-amber-50 text-amber-600", value: "text-amber-700" },
    green: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700" },
    red: { icon: "bg-red-50 text-red-600", value: "text-red-700" },
  };
  const s = styles[tone];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.icon}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className={`text-2xl font-bold mt-2 ${s.value}`}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}
