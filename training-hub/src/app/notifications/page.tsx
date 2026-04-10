"use client";

import { useState } from "react";
import {
  Bell,
  Send,
  AlertTriangle,
  Clock,
  CalendarDays,
  Users,
} from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { Loading, ErrorState } from "@/components/ui/DataState";

/* ── API response types ─────────────────────────────────── */

interface ComplianceIssue {
  employee: string;
  training: string;
  status: "expired" | "expiring_soon" | "needed";
  date: string | null;
  expirationDate: string | null;
  division?: string;
  daysUntilExpiry?: number | null;
}

interface ScheduledSession {
  training: string;
  date: string;
  sortDateMs: number;
  time: string;
  location: string;
  enrolled: string[];
  capacity: number;
  status: "scheduled" | "completed";
}

/* ── Helpers ────────────────────────────────────────────── */

function formatDate(d: string | null): string {
  if (!d) return "N/A";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function withinDays(dateStr: string, days: number): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

/* ── Badge component ────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    expired: "bg-red-50 text-red-700 border-red-200",
    expiring_soon: "bg-amber-50 text-amber-700 border-amber-200",
    needed: "bg-blue-50 text-blue-700 border-blue-200",
    upcoming: "bg-violet-50 text-violet-700 border-violet-200",
  };
  const labels: Record<string, string> = {
    expired: "Expired",
    expiring_soon: "Expiring Soon",
    needed: "Needed",
    upcoming: "Upcoming",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
        styles[status] ?? "bg-slate-50 text-slate-600 border-slate-200"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

/* ── Alert row ──────────────────────────────────────────── */

function AlertRow({
  icon,
  employee,
  training,
  detail,
  status,
  division,
  daysUntilExpiry,
}: {
  icon: React.ReactNode;
  employee?: string;
  training: string;
  detail: string;
  status: string;
  division?: string;
  daysUntilExpiry?: number | null;
}) {
  return (
    <div className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4 min-w-0">
        {icon}
        <div className="min-w-0">
          {employee && (
            <p className="text-sm font-medium text-slate-900 truncate">
              {employee}
              {division && <span className="text-xs text-slate-400 font-normal ml-2">{division}</span>}
            </p>
          )}
          <p className="text-sm text-slate-500 truncate">{training}</p>
          <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {daysUntilExpiry !== undefined && daysUntilExpiry !== null && (
          <span className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md border ${
            daysUntilExpiry < 0 ? "bg-red-50 text-red-700 border-red-200" : daysUntilExpiry <= 30 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            {daysUntilExpiry < 0 ? `${Math.abs(daysUntilExpiry)}d overdue` : `${daysUntilExpiry}d`}
          </span>
        )}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────── */

function Section({
  title,
  icon: SectionIcon,
  count,
  color,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  color: "red" | "amber" | "blue" | "violet";
  children: React.ReactNode;
}) {
  const badge: Record<string, string> = {
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2">
          {SectionIcon}
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${badge[color]}`}
        >
          {count}
        </span>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

/* ── Alerts tab ─────────────────────────────────────────── */

function AlertsTab() {
  const { data: compData, loading: compLoading, error: compError } =
    useFetch<{ issues: ComplianceIssue[] }>("/api/compliance");
  const { data: schedData, loading: schedLoading, error: schedError } =
    useFetch<{ sessions: ScheduledSession[] }>("/api/schedule");

  if (compLoading || schedLoading) return <Loading />;
  if (compError) return <ErrorState message={compError} />;
  if (schedError) return <ErrorState message={schedError} />;

  const issues = compData?.issues ?? [];
  const sessions = schedData?.sessions ?? [];

  const expired = issues.filter((i) => i.status === "expired" || i.status === "needed");
  const expiringSoon = issues.filter((i) => i.status === "expiring_soon");
  const upcomingSessions = sessions.filter(
    (s) => s.status === "scheduled" && s.date && withinDays(s.date, 7)
  );

  if (expired.length === 0 && expiringSoon.length === 0 && upcomingSessions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Bell className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-900">All clear</h3>
        <p className="text-sm text-slate-500 mt-1">
          No compliance alerts or upcoming sessions right now.
        </p>
      </div>
    );
  }

  // Division summary
  const divCounts = new Map<string, { expired: number; expiring: number; needed: number }>();
  for (const issue of issues) {
    const div = issue.division || "Unknown";
    if (!divCounts.has(div)) divCounts.set(div, { expired: 0, expiring: 0, needed: 0 });
    const entry = divCounts.get(div)!;
    if (issue.status === "expired") entry.expired++;
    else if (issue.status === "expiring_soon") entry.expiring++;
    else if (issue.status === "needed") entry.needed++;
  }
  const divSummary = Array.from(divCounts.entries())
    .map(([div, counts]) => ({ division: div, ...counts, total: counts.expired + counts.expiring + counts.needed }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      {/* Division Summary */}
      {divSummary.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Alerts by Division</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {divSummary.slice(0, 8).map((d) => (
              <div key={d.division} className="border border-slate-200 rounded-xl p-3">
                <p className="text-xs font-medium text-slate-500 truncate">{d.division}</p>
                <p className="text-lg font-bold text-slate-900 mt-1">{d.total}</p>
                <div className="flex gap-2 mt-1 text-[10px]">
                  {d.expired > 0 && <span className="text-red-600">{d.expired} expired</span>}
                  {d.expiring > 0 && <span className="text-amber-600">{d.expiring} expiring</span>}
                  {d.needed > 0 && <span className="text-blue-600">{d.needed} needed</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <Section
          title="Expired / Needed"
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          count={expired.length}
          color="red"
        >
          {expired.map((issue, i) => (
            <AlertRow
              key={`exp-${i}`}
              icon={
                <div className="p-2 rounded-lg bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
              }
              employee={issue.employee}
              training={issue.training}
              detail={
                issue.expirationDate
                  ? `Expired ${formatDate(issue.expirationDate)}`
                  : issue.date
                    ? `Last completed ${formatDate(issue.date)}`
                    : "Never completed"
              }
              status={issue.status}
              division={issue.division}
              daysUntilExpiry={issue.daysUntilExpiry}
            />
          ))}
        </Section>
      )}

      {expiringSoon.length > 0 && (
        <Section
          title="Expiring Soon"
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          count={expiringSoon.length}
          color="amber"
        >
          {expiringSoon.map((issue, i) => (
            <AlertRow
              key={`es-${i}`}
              icon={
                <div className="p-2 rounded-lg bg-amber-50">
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
              }
              employee={issue.employee}
              training={issue.training}
              detail={
                issue.expirationDate
                  ? `Expires ${formatDate(issue.expirationDate)}`
                  : "Expiring soon"
              }
              status="expiring_soon"
              division={issue.division}
              daysUntilExpiry={issue.daysUntilExpiry}
            />
          ))}
        </Section>
      )}

      {upcomingSessions.length > 0 && (
        <Section
          title="Upcoming Classes (Next 7 Days)"
          icon={<CalendarDays className="h-4 w-4 text-violet-500" />}
          count={upcomingSessions.length}
          color="violet"
        >
          {upcomingSessions.map((session, i) => (
            <AlertRow
              key={`up-${i}`}
              icon={
                <div className="p-2 rounded-lg bg-violet-50">
                  <CalendarDays className="h-4 w-4 text-violet-500" />
                </div>
              }
              training={session.training}
              detail={`${formatDate(session.date)} at ${session.time || "TBD"} — ${session.enrolled.length} enrolled`}
              status="upcoming"
            />
          ))}
        </Section>
      )}
    </div>
  );
}

/* ── Send Report tab ────────────────────────────────────── */

function SendReportTab() {
  const [scope, setScope] = useState<"expired" | "expired_expiring" | "full">(
    "expired"
  );
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ expired: number; expiring: number; needed: number; total: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: compData, loading, error } =
    useFetch<{ issues: ComplianceIssue[] }>("/api/compliance");

  const issues = compData?.issues ?? [];
  const expiredCount = issues.filter(
    (i) => i.status === "expired" || i.status === "needed"
  ).length;
  const expiringSoonCount = issues.filter(
    (i) => i.status === "expiring_soon"
  ).length;

  const previewCount =
    scope === "expired"
      ? expiredCount
      : scope === "expired_expiring"
        ? expiredCount + expiringSoonCount
        : issues.length;

  async function handleGenerate() {
    setGenerating(true);
    setReport(null);
    setCopied(false);
    try {
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setReport(json.report);
      setCounts(json.counts);
    } catch {
      setReport("Error generating report.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Report scope */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Report Scope
          </label>
          <div className="space-y-2">
            {[
              { value: "expired" as const, label: "Expired Only" },
              {
                value: "expired_expiring" as const,
                label: "Expired + Expiring Soon",
              },
              { value: "full" as const, label: "Full Report" },
            ].map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="radio"
                  name="scope"
                  value={opt.value}
                  checked={scope === opt.value}
                  onChange={() => setScope(opt.value)}
                  className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-500">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading issue counts...</p>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <div className="border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Report Preview
            </h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
                <p className="text-xs text-slate-400">Expired / Needed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">
                  {expiringSoonCount}
                </p>
                <p className="text-xs text-slate-400">Expiring Soon</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {previewCount}
                </p>
                <p className="text-xs text-slate-400">Total in Report</p>
              </div>
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
          {generating ? "Generating..." : "Generate Report"}
        </button>

        {/* Generated report */}
        {report && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Generated Report</h4>
              <button
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                  copied
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>
            <pre className="border border-slate-200 rounded-xl p-4 text-xs text-slate-500 overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">
              {report}
            </pre>
            {counts && (
              <p className="text-xs text-slate-400">
                {counts.expired} expired, {counts.expiring} expiring, {counts.needed} needed — {counts.total} total issues
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────── */

export default function NotificationsPage() {
  const [tab, setTab] = useState<"alerts" | "send">("alerts");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="text-slate-500 mt-1">
          Compliance alerts and report delivery
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border border-slate-200 rounded-xl p-0.5 w-fit bg-white">
        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "alerts"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            Alerts
          </span>
        </button>
        <button
          onClick={() => setTab("send")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "send"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Send Report
          </span>
        </button>
      </div>

      {tab === "alerts" ? <AlertsTab /> : <SendReportTab />}
    </div>
  );
}
