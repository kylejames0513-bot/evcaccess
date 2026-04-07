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
    expired: "bg-red-100 text-red-700",
    expiring_soon: "bg-amber-100 text-amber-700",
    needed: "bg-red-100 text-red-700",
    upcoming: "bg-blue-100 text-blue-700",
  };
  const labels: Record<string, string> = {
    expired: "Expired",
    expiring_soon: "Expiring Soon",
    needed: "Needed",
    upcoming: "Upcoming",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
        styles[status] ?? "bg-slate-100 text-slate-600"
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
}: {
  icon: React.ReactNode;
  employee?: string;
  training: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4 min-w-0">
        {icon}
        <div className="min-w-0">
          {employee && (
            <p className="text-sm font-medium text-slate-900 truncate">
              {employee}
            </p>
          )}
          <p className="text-sm text-slate-600 truncate">{training}</p>
          <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────── */

function Section({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: "red" | "amber" | "blue";
  children: React.ReactNode;
}) {
  const border = {
    red: "border-red-200",
    amber: "border-amber-200",
    blue: "border-blue-200",
  }[color];
  const headerBg = {
    red: "bg-red-50",
    amber: "bg-amber-50",
    blue: "bg-blue-50",
  }[color];
  const headerText = {
    red: "text-red-800",
    amber: "text-amber-800",
    blue: "text-blue-800",
  }[color];
  const badge = {
    red: "bg-red-200 text-red-800",
    amber: "bg-amber-200 text-amber-800",
    blue: "bg-blue-200 text-blue-800",
  }[color];

  return (
    <div
      className={`bg-white rounded-xl border ${border} shadow-sm overflow-hidden`}
    >
      <div className={`${headerBg} px-6 py-3 flex items-center justify-between`}>
        <h3 className={`text-sm font-semibold ${headerText}`}>{title}</h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge}`}
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <Bell className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-medium text-slate-700">All clear</h3>
        <p className="text-sm text-slate-500 mt-1">
          No compliance alerts or upcoming sessions right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {expired.length > 0 && (
        <Section title="Expired / Needed" count={expired.length} color="red">
          {expired.map((issue, i) => (
            <AlertRow
              key={`exp-${i}`}
              icon={
                <div className="p-2 rounded-lg bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
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
            />
          ))}
        </Section>
      )}

      {expiringSoon.length > 0 && (
        <Section title="Expiring Soon" count={expiringSoon.length} color="amber">
          {expiringSoon.map((issue, i) => (
            <AlertRow
              key={`es-${i}`}
              icon={
                <div className="p-2 rounded-lg bg-amber-50">
                  <Clock className="h-4 w-4 text-amber-600" />
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
            />
          ))}
        </Section>
      )}

      {upcomingSessions.length > 0 && (
        <Section
          title="Upcoming Classes (Next 7 Days)"
          count={upcomingSessions.length}
          color="blue"
        >
          {upcomingSessions.map((session, i) => (
            <AlertRow
              key={`up-${i}`}
              icon={
                <div className="p-2 rounded-lg bg-blue-50">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
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
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        {/* Report scope */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
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
                <span className="text-sm text-slate-700">{opt.label}</span>
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
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Report Preview
            </h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
                <p className="text-xs text-slate-500">Expired / Needed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">
                  {expiringSoonCount}
                </p>
                <p className="text-xs text-slate-500">Expiring Soon</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-700">
                  {previewCount}
                </p>
                <p className="text-xs text-slate-500">Total in Report</p>
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
              <h4 className="text-sm font-medium text-slate-700">Generated Report</h4>
              <button
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  copied
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>
            <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="text-slate-500 mt-1">
          Compliance alerts and report delivery
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "alerts"
              ? "bg-white shadow text-slate-900"
              : "text-slate-600"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            Alerts
          </span>
        </button>
        <button
          onClick={() => setTab("send")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "send"
              ? "bg-white shadow text-slate-900"
              : "text-slate-600"
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
