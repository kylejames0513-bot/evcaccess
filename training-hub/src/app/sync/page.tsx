"use client";

import { useState } from "react";
import {
  RefreshCw,
  ExternalLink,
  Database,
  Users,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface SyncLogEntry {
  timestamp: string;
  source: string;
  applied: number;
  skipped: number;
  errors: number;
}

interface SyncStatusResponse {
  counts: {
    activeEmployees: number;
    trainingRecords: number;
    excusals: number;
    upcomingSessions: number;
  };
  lastSync: SyncLogEntry | null;
  recentSyncs: SyncLogEntry[];
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function SyncPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error } = useFetch<SyncStatusResponse>(
    `/api/sync-status?r=${refreshKey}`
  );

  async function refreshAll() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  if (loading && !data) return <Loading message="Loading sync status..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { counts, lastSync, recentSyncs } = data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sync</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Supabase is the source of truth. Sync new employee data and training
          completions from Google Sheets, then refresh the app cache.
        </p>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Active Employees"
          value={counts.activeEmployees}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Training Records"
          value={counts.trainingRecords}
          icon={Database}
          color="green"
        />
        <StatCard
          title="Excusals"
          value={counts.excusals}
          icon={ShieldCheck}
          color="purple"
        />
        <StatCard
          title="Upcoming Sessions"
          value={counts.upcomingSessions}
          icon={Calendar}
          color="yellow"
        />
      </div>

      {/* Actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Sync from Google Sheet
          </h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Open the EVC training spreadsheet, then run{" "}
            <strong>Supabase Sync → Build Merged Sheet → Push Merged → Supabase</strong>{" "}
            from the menu.
          </p>
          <a
            href="https://docs.google.com/spreadsheets"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open Google Sheet
          </a>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">Refresh App</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Clear the app&apos;s in-memory caches to immediately reflect the
            latest Supabase data.
          </p>
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh Now
          </button>
        </div>
      </div>

      {/* Last sync */}
      {lastSync && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            Last Sync
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-700">
              {formatTimestamp(lastSync.timestamp)}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{lastSync.source}</span>
            <span className="text-slate-400">·</span>
            <span className="text-emerald-700">
              {lastSync.applied} applied
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{lastSync.skipped} skipped</span>
            {lastSync.errors > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-red-700">{lastSync.errors} errors</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            Recent Sync History
          </h2>
        </div>
        {recentSyncs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No sync history yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentSyncs.map((entry) => (
              <div
                key={entry.timestamp}
                className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-slate-50"
              >
                {entry.errors > 0 ? (
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                )}
                <span className="text-slate-700 font-medium">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500">{entry.source}</span>
                <span className="ml-auto text-xs text-slate-500">
                  <span className="text-emerald-700 font-medium">
                    {entry.applied}
                  </span>{" "}
                  applied · {entry.skipped} skipped
                  {entry.errors > 0 && (
                    <>
                      {" "}
                      · <span className="text-red-700">{entry.errors} err</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
