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
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import type { ComplianceStatus } from "@/types/database";

const EXCUSAL_REASONS = [
  { code: "N/A", label: "N/A (General)" },
  { code: "Facilities", label: "Facilities" },
  { code: "MAINT", label: "Maintenance" },
  { code: "HR", label: "HR" },
  { code: "ADMIN", label: "Admin" },
  { code: "FINANCE", label: "Finance" },
  { code: "IT", label: "IT" },
  { code: "NURSE", label: "Nurse" },
  { code: "LPN", label: "LPN" },
  { code: "RN", label: "RN" },
  { code: "DIR", label: "Director" },
  { code: "MGR", label: "Manager" },
  { code: "SUPERVISOR", label: "Supervisor" },
  { code: "TRAINER", label: "Trainer" },
  { code: "BH", label: "Behavioral Health" },
  { code: "ELC", label: "ELC" },
  { code: "EI", label: "EI" },
  { code: "BOARD", label: "Board of Directors" },
];

function trainingColumnKey(name: string): string {
  const def = TRAINING_DEFINITIONS.find(
    (d) =>
      d.name.toLowerCase() === name.toLowerCase() ||
      d.aliases?.some((a) => a.toLowerCase() === name.toLowerCase())
  );
  return def?.columnKey ?? name;
}

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

function statusColor(status: ComplianceStatus): string {
  if (status === "expired") return "bg-red-50 text-red-700 border border-red-200";
  if (status === "expiring_soon") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-blue-50 text-blue-700 border border-blue-200";
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

  if (loading) return <Loading message="Loading dashboard..." />;
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
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-slate-400 font-medium">{todayStr}</p>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{greeting}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Training compliance overview for Emory Valley Center</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openQuickRecord()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Zap className="h-4 w-4" /> Record Training
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-300 text-sm font-medium transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Compliance ring */}
          <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={complianceRate >= 80 ? "#10b981" : complianceRate >= 60 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="2.5"
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
              <p className="text-xs text-slate-500 font-medium">Compliant</p>
              <p className="text-[11px] text-slate-400">{stats.totalEmployees} total</p>
            </div>
          </div>

          <StatTile icon={XCircle} value={stats.expired} label="Expired" color="red" />
          <StatTile icon={AlertTriangle} value={stats.expiringSoon} label="Expiring Soon" color="amber" />
          <StatTile icon={Info} value={stats.needed} label="Needs Training" color="blue" />
          <StatTile icon={CalendarDays} value={stats.upcomingSessions} label="Scheduled" color="violet" />
        </div>

        {/* Two-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Urgent issues */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold text-slate-900">Action Required</h2>
                {urgentIssues.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-200">
                    {urgentIssues.length}
                  </span>
                )}
              </div>
              <Link href="/compliance" className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {urgentIssues.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">All caught up!</p>
                <p className="text-xs text-slate-400 mt-0.5">No expired or expiring trainings</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {urgentIssues.slice(0, 6).map((issue, i) => (
                  <UrgentIssueRow
                    key={i}
                    issue={issue}
                    onRecord={() => openQuickRecord(issue.employee, issue.training)}
                    onExcused={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Upcoming sessions */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-slate-900">Upcoming Sessions</h2>
              </div>
              <Link href="/schedule" className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5">
                Schedule <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="py-12 text-center">
                <Clock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">No upcoming sessions</p>
                <Link href="/schedule" className="text-xs text-blue-600 hover:underline mt-1 block">
                  Schedule one →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
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
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md shrink-0 border ${isFull ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {session.enrolled.length}/{session.capacity}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isFull ? "bg-red-400" : "bg-violet-400"}`}
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

        {/* Source status strip */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Data Sources</span>
          </div>
          <Link href="/paylocity-audit" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700 transition-colors">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Paylocity Audit
            <ChevronRight className="h-3 w-3" />
          </Link>
          <Link href="/phs-import" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-violet-700 transition-colors">
            <span className="w-2 h-2 rounded-full bg-violet-400"></span>
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

function UrgentIssueRow({
  issue,
  onRecord,
  onExcused,
}: {
  issue: DashboardData["urgentIssues"][number];
  onRecord: () => void;
  onExcused: () => void;
}) {
  const [excusing, setExcusing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleExcuse(reason: string) {
    setPickerOpen(false);
    setExcusing(true);
    try {
      await fetch("/api/excusal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: issue.employee,
          trainingColumnKey: trainingColumnKey(issue.training),
          excused: true,
          reason,
        }),
      });
      onExcused();
    } catch {
      setExcusing(false);
    }
  }

  return (
    <div className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors group">
      <StatusIcon status={issue.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{issue.employee}</p>
        <p className="text-xs text-slate-500 truncate">{issue.training}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {issue.expirationDate && !pickerOpen && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${statusColor(issue.status)}`}>
            {formatExpiry(issue.expirationDate)}
          </span>
        )}
        {pickerOpen ? (
          <>
            <select
              autoFocus
              defaultValue=""
              disabled={excusing}
              onChange={(e) => { if (e.target.value) handleExcuse(e.target.value); }}
              className="px-2 py-1 border border-slate-200 rounded-md text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="" disabled>Reason...</option>
              {EXCUSAL_REASONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <button
              onClick={() => setPickerOpen(false)}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setPickerOpen(true)}
              disabled={excusing}
              className="opacity-0 group-hover:opacity-100 px-2.5 py-1 text-[11px] font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all disabled:opacity-50"
            >
              {excusing ? "..." : "Excuse"}
            </button>
            <button
              onClick={onRecord}
              disabled={excusing}
              className="opacity-0 group-hover:opacity-100 px-2.5 py-1 text-[11px] font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all disabled:opacity-50"
            >
              Record
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    red:    { bg: "bg-white", text: "text-red-600",    iconBg: "bg-red-50" },
    amber:  { bg: "bg-white", text: "text-amber-600",  iconBg: "bg-amber-50" },
    blue:   { bg: "bg-white", text: "text-blue-600",   iconBg: "bg-blue-50" },
    violet: { bg: "bg-white", text: "text-violet-600",  iconBg: "bg-violet-50" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`${c.bg} rounded-xl border border-slate-200 p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
    </div>
  );
}
