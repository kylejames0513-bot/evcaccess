"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, CheckCircle2, Clock, CalendarDays,
  RefreshCw, Zap, TrendingUp, ChevronRight, Layers,
  XCircle, AlertCircle, Info,
} from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import QuickRecord from "@/components/QuickRecord";
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

function StatusIcon({ status }: { status: ComplianceStatus }) {
  if (status === "expired") return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (status === "expiring_soon") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
}

function statusLabel(status: ComplianceStatus): string {
  if (status === "expired") return "Expired";
  if (status === "expiring_soon") return "Expiring Soon";
  if (status === "needed") return "Needed";
  return status;
}

function statusColor(status: ComplianceStatus): string {
  if (status === "expired") return "bg-red-100 text-red-700";
  if (status === "expiring_soon") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d`;
}

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [quickRecordOpen, setQuickRecordOpen] = useState(false);
  const [quickRecordEmployee, setQuickRecordEmployee] = useState("");
  const [quickRecordTraining, setQuickRecordTraining] = useState("");

  const { data, loading, error } = useFetch<DashboardData>(`/api/dashboard?r=${refreshKey}`);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  function openQuickRecord(employee = "", training = "") {
    setQuickRecordEmployee(employee);
    setQuickRecordTraining(training);
    setQuickRecordOpen(true);
  }

  if (loading) return <Loading message="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { stats, urgentIssues, upcoming } = data;
  const complianceRate = stats.totalEmployees > 0
    ? Math.round((stats.fullyCompliant / stats.totalEmployees) * 100)
    : 0;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-slate-400">{todayStr}</p>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{greeting} 👋</h1>
            <p className="text-sm text-slate-500 mt-0.5">Training compliance overview for Emory Valley Center</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openQuickRecord()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Zap className="h-4 w-4" /> Record Training
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Stat row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Compliance ring */}
          <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={complianceRate >= 80 ? "#10b981" : complianceRate >= 60 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="3"
                  strokeDasharray={`${complianceRate} ${100 - complianceRate}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
                {complianceRate}%
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.fullyCompliant}</p>
              <p className="text-xs text-slate-500">Compliant</p>
              <p className="text-[11px] text-slate-400">{stats.totalEmployees} total</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
            <p className="text-xs text-slate-500 mt-0.5">Expired</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
            <p className="text-xs text-slate-500 mt-0.5">Expiring Soon</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.needed}</p>
            <p className="text-xs text-slate-500 mt-0.5">Needs Training</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-purple-600">{stats.upcomingSessions}</p>
            <p className="text-xs text-slate-500 mt-0.5">Scheduled Sessions</p>
          </div>
        </div>

        {/* ── Two-column section ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Urgent issues */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold text-slate-900">Action Required</h2>
                {urgentIssues.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">
                    {urgentIssues.length}
                  </span>
                )}
              </div>
              <Link href="/compliance" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {urgentIssues.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
                <p className="text-sm font-medium text-slate-700">All caught up!</p>
                <p className="text-xs text-slate-400 mt-0.5">No expired or expiring trainings</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {urgentIssues.slice(0, 6).map((issue, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors group">
                    <StatusIcon status={issue.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{issue.employee}</p>
                      <p className="text-xs text-slate-500 truncate">{issue.training}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {issue.expirationDate && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(issue.status)}`}>
                          {formatExpiry(issue.expirationDate)}
                        </span>
                      )}
                      <button
                        onClick={() => openQuickRecord(issue.employee, issue.training)}
                        className="opacity-0 group-hover:opacity-100 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all"
                      >
                        Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming sessions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-purple-500" />
                <h2 className="text-sm font-semibold text-slate-900">Upcoming Sessions</h2>
              </div>
              <Link href="/schedule" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                Schedule <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="py-10 text-center">
                <Clock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">No upcoming sessions</p>
                <Link href="/schedule" className="text-xs text-blue-600 hover:underline mt-1 block">
                  Schedule one →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {upcoming.map((session, i) => {
                  const pct = session.capacity > 0 ? Math.round((session.enrolled.length / session.capacity) * 100) : 0;
                  const isFull = session.enrolled.length >= session.capacity;
                  return (
                    <div key={i} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{session.training}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">{formatSessionDate(session.date)}</span>
                            {session.time && <span className="text-xs text-slate-400">at {session.time}</span>}
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${isFull ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                          {session.enrolled.length}/{session.capacity}
                        </span>
                      </div>
                      {/* capacity bar */}
                      <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isFull ? "bg-red-400" : "bg-purple-400"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Source status strip ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Data Sources</span>
          </div>
          <Link href="/paylocity-audit" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700 transition-colors">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Paylocity Audit
            <ChevronRight className="h-3 w-3" />
          </Link>
          <Link href="/phs-import" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-purple-700 transition-colors">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            PHS Import
            <ChevronRight className="h-3 w-3" />
          </Link>
          <Link href="/master-sync" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-emerald-700 transition-colors">
            <Layers className="h-3.5 w-3.5 text-emerald-500" />
            Master Sync
            <ChevronRight className="h-3 w-3" />
          </Link>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5" />
            {stats.totalEmployees} active employees
          </div>
        </div>
      </div>

      <QuickRecord
        isOpen={quickRecordOpen}
        onClose={() => {
          setQuickRecordOpen(false);
          setRefreshKey((k) => k + 1);
        }}
        defaultEmployee={quickRecordEmployee}
        defaultTraining={quickRecordTraining}
      />
    </>
  );
}
