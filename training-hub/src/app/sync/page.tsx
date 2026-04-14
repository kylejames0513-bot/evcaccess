"use client";

import { RefreshCw, ExternalLink, Activity, AlertTriangle } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface SyncSummaryData {
  roster: {
    activeEmployees: number;
    inactiveEmployees: number;
  };
  records: {
    totalTrainingRecords: number;
    totalExcusals: number;
    upcomingSessions: number;
  };
  recentSyncs: Array<{
    timestamp: string;
    source: string;
    applied: number;
    skipped: number;
    errors: number;
  }>;
  latestSync: {
    timestamp: string;
    source: string;
    applied: number;
    skipped: number;
    errors: number;
  } | null;
  dataQuality: {
    total: number;
    missingDepartment: number;
    missingHireDate: number;
    badDates: number;
    duplicates: number;
    orphanRecords: number;
    orphanExcusals: number;
  };
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function SyncPage() {
  const { data, loading, error } = useFetch<SyncSummaryData>("/api/sync/summary");

  if (loading) return <Loading message="Loading sync dashboard..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Google Sheets Sync</h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitor sync health, compliance data freshness, and quality checks.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Employees" value={data.roster.activeEmployees} />
        <StatCard label="Training Records" value={data.records.totalTrainingRecords} />
        <StatCard label="Excusals" value={data.records.totalExcusals} />
        <StatCard label="Upcoming Sessions" value={data.records.upcomingSessions} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">Run Sync</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Use your Apps Script menu: <strong>Supabase Sync → Build Merged Sheet → Push Merged → Supabase</strong>.
          </p>
          <a
            href="https://docs.google.com/spreadsheets"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open Google Sheets
          </a>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">Latest Sync</h2>
          {data.latestSync ? (
            <div className="mt-2 space-y-1.5 text-sm">
              <p className="text-slate-700">{formatTimestamp(data.latestSync.timestamp)}</p>
              <p className="text-slate-500">Source: {data.latestSync.source}</p>
              <p className="text-emerald-700">
                {data.latestSync.applied} applied
                <span className="text-slate-400"> · {data.latestSync.skipped} skipped</span>
              </p>
              {data.latestSync.errors > 0 && (
                <p className="text-red-600">{data.latestSync.errors} errors</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">No sync log entries yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Data Quality Snapshot</h2>
          <a
            href="/data-health"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
          >
            <Activity className="h-3.5 w-3.5" />
            View full report
          </a>
        </div>
        <div className="p-5 grid sm:grid-cols-3 gap-3">
          <IssueCard label="Total Issues" value={data.dataQuality.total} tone={data.dataQuality.total > 0 ? "red" : "green"} />
          <IssueCard label="Missing Department" value={data.dataQuality.missingDepartment} tone={data.dataQuality.missingDepartment > 0 ? "amber" : "green"} />
          <IssueCard label="Missing Hire Date" value={data.dataQuality.missingHireDate} tone={data.dataQuality.missingHireDate > 0 ? "amber" : "green"} />
          <IssueCard label="Bad Dates" value={data.dataQuality.badDates} tone={data.dataQuality.badDates > 0 ? "amber" : "green"} />
          <IssueCard label="Duplicate Employees" value={data.dataQuality.duplicates} tone={data.dataQuality.duplicates > 0 ? "amber" : "green"} />
          <IssueCard label="Orphans" value={data.dataQuality.orphanRecords + data.dataQuality.orphanExcusals} tone={data.dataQuality.orphanRecords + data.dataQuality.orphanExcusals > 0 ? "amber" : "green"} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Recent Sync History</h2>
        </div>
        {data.recentSyncs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No sync history yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentSyncs.map((entry) => (
              <div key={entry.timestamp} className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-slate-50">
                {entry.errors > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <RefreshCw className="h-4 w-4 text-emerald-500 shrink-0" />
                )}
                <span className="text-slate-700 font-medium">{formatTimestamp(entry.timestamp)}</span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500">{entry.source}</span>
                <span className="ml-auto text-xs text-slate-500">
                  <span className="text-emerald-700 font-medium">{entry.applied}</span>
                  {" "}applied · {entry.skipped} skipped
                  {entry.errors > 0 && <> · <span className="text-red-700">{entry.errors} err</span></>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function IssueCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "red";
}) {
  const toneClass: Record<typeof tone, string> = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
