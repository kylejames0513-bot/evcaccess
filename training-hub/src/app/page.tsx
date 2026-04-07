"use client";

import { useState } from "react";
import {
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  CalendarDays,
  XCircle,
  RefreshCw,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import type { ComplianceStatus } from "@/types/database";

interface DashboardData {
  stats: {
    totalEmployees: number;
    fullyCompliant: number;
    expiringSoon: number;
    expired: number;
    needed: number;
    upcomingSessions: number;
    criticalExpiring: number;
  };
  urgentIssues: Array<{
    employee: string;
    training: string;
    status: ComplianceStatus;
    date: string | null;
    expirationDate: string | null;
  }>;
  upcoming: Array<{
    training: string;
    date: string;
    time: string;
    enrolled: string[];
    capacity: number;
  }>;
}

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error } = useFetch<DashboardData>(`/api/dashboard?r=${refreshKey}`);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { stats, urgentIssues, upcoming } = data;
  const complianceRate = stats.totalEmployees > 0
    ? Math.round((stats.fullyCompliant / stats.totalEmployees) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Training Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Primary training compliance at a glance</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-500">
          <div className={`w-2 h-2 rounded-full ${complianceRate >= 90 ? "bg-emerald-500" : complianceRate >= 70 ? "bg-amber-500" : "bg-red-500"}`} />
          {complianceRate}% compliant
        </div>
        </div>
      </div>

      {/* Critical Alert Banner */}
      {(stats.criticalExpiring > 0 || stats.expired > 0) && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${stats.expired > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <AlertTriangle className={`h-5 w-5 shrink-0 ${stats.expired > 0 ? "text-red-600" : "text-amber-600"}`} />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${stats.expired > 0 ? "text-red-700" : "text-amber-700"}`}>
              {stats.expired > 0 && <>{stats.expired} training(s) expired</>}
              {stats.expired > 0 && stats.criticalExpiring > 0 && " and "}
              {stats.criticalExpiring > 0 && <>{stats.criticalExpiring} expiring within 30 days</>}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">These need immediate attention to maintain compliance.</p>
          </div>
          <a
            href="/compliance"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium text-white shrink-0 ${stats.expired > 0 ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
          >
            View Details
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Employees" value={stats.totalEmployees} icon={Users} color="blue" />
        <StatCard title="Compliant" value={stats.fullyCompliant} subtitle={`${complianceRate}%`} icon={CheckCircle} color="green" />
        <StatCard title="Expiring" value={stats.expiringSoon} subtitle="60 days" icon={Clock} color="yellow" />
        <StatCard title="Expired" value={stats.expired} subtitle="Past due" icon={XCircle} color="red" />
        <StatCard title="Classes" value={stats.upcomingSessions} subtitle="Upcoming" icon={CalendarDays} color="purple" />
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Urgent issues — wider */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Action Required</h2>
              <p className="text-xs text-slate-400 mt-0.5">Expired and expiring trainings</p>
            </div>
            <a href="/compliance" className="text-xs font-medium text-blue-600 hover:text-blue-800">
              View all →
            </a>
          </div>
          {urgentIssues.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">All clear! No urgent issues.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5">Employee</th>
                  <th className="px-5 py-2.5">Training</th>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {urgentIssues.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{item.employee}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{item.training}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{item.expirationDate || item.date || "Never"}</td>
                    <td className="px-5 py-3"><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming classes — narrower */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Upcoming Classes</h2>
              <p className="text-xs text-slate-400 mt-0.5">Next sessions scheduled</p>
            </div>
            <a href="/schedule" className="text-xs font-medium text-blue-600 hover:text-blue-800">
              Schedule →
            </a>
          </div>
          {upcoming.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CalendarDays className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No sessions scheduled.</p>
              <a href="/schedule" className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1 inline-block">
                Create one →
              </a>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {upcoming.map((session, i) => {
                const count = session.enrolled.length;
                const pct = Math.round((count / session.capacity) * 100);
                return (
                  <div key={i} className="px-5 py-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{session.training}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {session.date}{session.time ? ` \u00b7 ${session.time}` : ""}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ${pct >= 100 ? "text-red-600" : pct >= 75 ? "text-amber-600" : "text-emerald-600"}`}>
                        {count}/{session.capacity}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
