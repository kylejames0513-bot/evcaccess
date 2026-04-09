"use client";

import { useState } from "react";
import { XCircle, Clock, AlertTriangle, UserPlus, Loader2, Check, X, CalendarPlus, RefreshCw, Download, ChevronDown, ChevronRight } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmployeeDetailModal from "@/components/EmployeeDetailModal";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { namesMatch } from "@/lib/name-utils";
import { trainingMatchesAny } from "@/lib/training-match";
import { formatDivision } from "@/lib/format-utils";
import type { ComplianceStatus } from "@/types/database";

interface EnrichedIssue {
  employee: string;
  training: string;
  status: ComplianceStatus;
  date: string | null;
  expirationDate: string | null;
  division: string;
  daysUntilExpiry: number | null;
}

interface ComplianceData {
  issues: EnrichedIssue[];
  departmentSummary: Array<{
    division: string;
    total: number;
    expired: number;
    expiring: number;
    needed: number;
    complianceRate: number;
  }>;
  expirationTimeline: {
    overdue: number;
    critical: number;
    warning: number;
    notice: number;
    safe: number;
  };
  thresholds: { notice: number; warning: number; critical: number };
}

interface ScheduleData {
  sessions: Array<{
    id: string;
    training: string;
    date: string;
    time: string;
    location: string;
    enrolled: string[];
    capacity: number;
    sortDateMs: number;
    status: "scheduled" | "completed";
  }>;
}

function DaysUntilBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-slate-400">—</span>;
  let color = "bg-slate-100 text-slate-600";
  if (days < 0) color = "bg-red-100 text-red-700";
  else if (days <= 30) color = "bg-red-100 text-red-700";
  else if (days <= 60) color = "bg-amber-100 text-amber-700";
  else if (days <= 90) color = "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${color}`}>
      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
    </span>
  );
}

export default function CompliancePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error } = useFetch<ComplianceData>(`/api/compliance?r=${refreshKey}`);
  const { data: scheduleData } = useFetch<ScheduleData>("/api/schedule");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [trainingFilter, setTrainingFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [enrollPopup, setEnrollPopup] = useState<{ employee: string; training: string } | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [groupByDivision, setGroupByDivision] = useState(false);
  const [collapsedDivisions, setCollapsedDivisions] = useState<Set<string>>(new Set());
  const [timelineBucket, setTimelineBucket] = useState<string | null>(null);

  const { data: freshSchedule } = useFetch<ScheduleData>(`/api/schedule?r=${refreshKey}`);
  const schedSessions = (freshSchedule || scheduleData)?.sessions || [];

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { issues, departmentSummary, expirationTimeline, thresholds } = data;
  const expired = issues.filter((c) => c.status === "expired");
  const expiring = issues.filter((c) => c.status === "expiring_soon");
  const needed = issues.filter((c) => c.status === "needed");
  const critical30 = issues.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= 30 && c.daysUntilExpiry >= 0);
  const trainings = [...new Set(issues.map((c) => c.training))].sort();
  const divisions = [...new Set(issues.map((c) => c.division).filter(Boolean))].sort();

  // Timeline bucket filter
  function matchesBucket(issue: EnrichedIssue): boolean {
    if (!timelineBucket) return true;
    const d = issue.daysUntilExpiry;
    if (d === null) return timelineBucket === "needed";
    if (timelineBucket === "overdue") return d < 0;
    if (timelineBucket === "critical") return d >= 0 && d <= thresholds.critical;
    if (timelineBucket === "warning") return d > thresholds.critical && d <= thresholds.warning;
    if (timelineBucket === "notice") return d > thresholds.warning && d <= thresholds.notice;
    return false;
  }

  const filtered = issues.filter((c) => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesTraining = trainingFilter === "all" || c.training === trainingFilter;
    const matchesDivision = divisionFilter === "all" || c.division === divisionFilter;
    const matchesSearch = !search || c.employee.toLowerCase().includes(search.toLowerCase());
    const matchesTl = matchesBucket(c);
    return matchesStatus && matchesTraining && matchesDivision && matchesSearch && matchesTl;
  });

  function getOpenSessions(trainingName: string) {
    return schedSessions
      .filter(
        (s) => s.status === "scheduled" &&
          trainingMatchesAny(s.training, trainingName) &&
          s.enrolled.length < s.capacity
      )
      .sort((a, b) => (a.sortDateMs || 0) - (b.sortDateMs || 0));
  }

  function exportCSV() {
    const header = "Employee,Training,Last Completed,Expires,Days Until Expiry,Status,Division";
    const rows = filtered.map((c) =>
      `"${c.employee}","${c.training}","${c.date || ""}","${c.expirationDate || ""}","${c.daysUntilExpiry ?? ""}","${c.status}","${c.division || ""}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleDivisionCollapse(div: string) {
    const next = new Set(collapsedDivisions);
    if (next.has(div)) next.delete(div);
    else next.add(div);
    setCollapsedDivisions(next);
  }

  // Group filtered issues by division
  const groupedByDiv = new Map<string, EnrichedIssue[]>();
  if (groupByDivision) {
    for (const item of filtered) {
      const div = item.division || "Unknown";
      if (!groupedByDiv.has(div)) groupedByDiv.set(div, []);
      groupedByDiv.get(div)!.push(item);
    }
  }

  // Timeline bar total for percentage calculation
  const tlTotal = expirationTimeline.overdue + expirationTimeline.critical + expirationTimeline.warning + expirationTimeline.notice;
  const tlPercent = (count: number) => tlTotal > 0 ? Math.max((count / tlTotal) * 100, count > 0 ? 3 : 0) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">{issues.length} total issues — sorted by urgency</p>
        </div>
        <button
          onClick={async () => {
            setRefreshing(true);
            try { await fetch("/api/refresh", { method: "POST" }); setRefreshKey((k) => k + 1); } catch {}
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
          title="Refresh data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Expired" value={expired.length} subtitle="Immediate action" icon={XCircle} color="red" />
        <StatCard title="Expiring" value={expiring.length} subtitle={`Within ${thresholds.warning} days`} icon={Clock} color="yellow" />
        <StatCard title="Needed" value={needed.length} subtitle="Never completed" icon={AlertTriangle} color="purple" />
        <StatCard title="Critical" value={critical30.length} subtitle="Within 30 days" icon={AlertTriangle} color="red" />
      </div>

      {/* Expiration Timeline Bar */}
      {tlTotal > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Expiration Timeline</h3>
            {timelineBucket && (
              <button onClick={() => setTimelineBucket(null)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Clear filter</button>
            )}
          </div>
          <div className="flex rounded-lg overflow-hidden h-8">
            {[
              { key: "overdue", count: expirationTimeline.overdue, color: "bg-red-500", label: "Overdue" },
              { key: "critical", count: expirationTimeline.critical, color: "bg-red-400", label: `0-${thresholds.critical}d` },
              { key: "warning", count: expirationTimeline.warning, color: "bg-amber-400", label: `${thresholds.critical + 1}-${thresholds.warning}d` },
              { key: "notice", count: expirationTimeline.notice, color: "bg-yellow-300", label: `${thresholds.warning + 1}-${thresholds.notice}d` },
            ].map(({ key, count, color, label }) => count > 0 ? (
              <button
                key={key}
                onClick={() => setTimelineBucket(timelineBucket === key ? null : key)}
                className={`${color} flex items-center justify-center text-white text-[10px] font-bold transition-all hover:opacity-80 ${timelineBucket === key ? "ring-2 ring-offset-1 ring-slate-800" : ""}`}
                style={{ width: `${tlPercent(count)}%` }}
                title={`${label}: ${count}`}
              >
                {count > 0 && count}
              </button>
            ) : null)}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
            <span><span className="inline-block w-2 h-2 rounded bg-red-500 mr-1" />Overdue ({expirationTimeline.overdue})</span>
            <span><span className="inline-block w-2 h-2 rounded bg-red-400 mr-1" />Critical ({expirationTimeline.critical})</span>
            <span><span className="inline-block w-2 h-2 rounded bg-amber-400 mr-1" />Warning ({expirationTimeline.warning})</span>
            <span><span className="inline-block w-2 h-2 rounded bg-yellow-300 mr-1" />Notice ({expirationTimeline.notice})</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <input
          type="text"
          placeholder="Search employee..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All statuses ({issues.length})</option>
          <option value="expired">Expired ({expired.length})</option>
          <option value="expiring_soon">Expiring ({expiring.length})</option>
          <option value="needed">Needed ({needed.length})</option>
        </select>
        <select value={trainingFilter} onChange={(e) => setTrainingFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All trainings</option>
          {trainings.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{formatDivision(d)}</option>)}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setGroupByDivision(!groupByDivision)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${groupByDivision ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Group by Division
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <span className="text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {selectedEmployee && (
        <EmployeeDetailModal
          name={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onEnrolled={() => { setSelectedEmployee(null); setRefreshKey((k) => k + 1); }}
        />
      )}

      {enrollPopup && (
        <QuickEnrollPopup
          employee={enrollPopup.employee}
          training={enrollPopup.training}
          sessions={getOpenSessions(enrollPopup.training)}
          onClose={() => setEnrollPopup(null)}
          onEnrolled={() => {
            setEnrollPopup(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {groupByDivision ? (
            // Grouped view
            <div>
              {Array.from(groupedByDiv.entries())
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([div, divIssues]) => {
                  const isCollapsed = collapsedDivisions.has(div);
                  const divSummary = departmentSummary.find((d) => d.division === div);
                  return (
                    <div key={div}>
                      <button
                        onClick={() => toggleDivisionCollapse(div)}
                        className="w-full flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 text-left"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        <span className="text-sm font-semibold text-slate-900">{formatDivision(div)}</span>
                        <span className="text-xs text-slate-500">({divIssues.length} issues)</span>
                        {divSummary && (
                          <span className={`ml-auto text-xs font-semibold ${divSummary.complianceRate >= 80 ? "text-emerald-600" : divSummary.complianceRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                            {divSummary.complianceRate}% compliance
                          </span>
                        )}
                      </button>
                      {!isCollapsed && (
                        <table className="w-full table-striped">
                          <thead>
                            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                              <th className="px-5 py-3">Employee</th>
                              <th className="px-5 py-3">Training</th>
                              <th className="px-5 py-3">Last Completed</th>
                              <th className="px-5 py-3">Expires</th>
                              <th className="px-5 py-3">Urgency</th>
                              <th className="px-5 py-3">Status</th>
                              <th className="px-5 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {divIssues.map((item, i) => (
                              <IssueRow
                                key={i}
                                item={item}
                                schedSessions={schedSessions}
                                onEmployeeClick={setSelectedEmployee}
                                onEnrollClick={setEnrollPopup}
                              />
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            // Flat view
            <table className="w-full table-striped">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Training</th>
                  <th className="px-5 py-3">Last Completed</th>
                  <th className="px-5 py-3">Expires</th>
                  <th className="px-5 py-3">Urgency</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item, i) => (
                  <IssueRow
                    key={i}
                    item={item}
                    schedSessions={schedSessions}
                    onEmployeeClick={setSelectedEmployee}
                    onEnrollClick={setEnrollPopup}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-400">No compliance issues match your filters.</div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Issue Row Component
// ────────────────────────────────────────────────────────────

function IssueRow({
  item,
  schedSessions,
  onEmployeeClick,
  onEnrollClick,
}: {
  item: EnrichedIssue;
  schedSessions: ScheduleData["sessions"];
  onEmployeeClick: (name: string) => void;
  onEnrollClick: (data: { employee: string; training: string }) => void;
}) {
  const openSessions = schedSessions
    .filter(
      (s) => s.status === "scheduled" &&
        trainingMatchesAny(s.training, item.training) &&
        s.enrolled.length < s.capacity
    )
    .sort((a, b) => (a.sortDateMs || 0) - (b.sortDateMs || 0));
  const hasOpenSession = openSessions.length > 0;

  const enrolledSession = schedSessions.find(
    (s) => s.status === "scheduled" &&
      trainingMatchesAny(s.training, item.training) &&
      s.enrolled.some((n) => namesMatch(n, item.employee))
  );

  return (
    <tr className={`hover:bg-blue-50/30 group ${enrolledSession ? "bg-emerald-50/30" : ""}`}>
      <td className="px-5 py-3 text-sm font-medium text-blue-700 hover:text-blue-900 cursor-pointer" onClick={() => onEmployeeClick(item.employee)}>{item.employee}</td>
      <td className="px-5 py-3 text-sm text-slate-600">{item.training}</td>
      <td className="px-5 py-3 text-sm text-slate-500">{item.date || "—"}</td>
      <td className="px-5 py-3 text-sm text-slate-500">{item.expirationDate || "—"}</td>
      <td className="px-5 py-3"><DaysUntilBadge days={item.daysUntilExpiry} /></td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={item.status} />
          {enrolledSession && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-600/20">
              <CalendarPlus className="h-2.5 w-2.5" />
              Scheduled {enrolledSession.date}
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3 text-right">
        {enrolledSession ? (
          <span className="text-xs text-emerald-600 font-medium">Enrolled</span>
        ) : (
          <button
            onClick={() => onEnrollClick({ employee: item.employee, training: item.training })}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              hasOpenSession
                ? "bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-inset ring-blue-600/20"
                : "bg-slate-50 text-slate-500 hover:bg-slate-100 ring-1 ring-inset ring-slate-500/10"
            }`}
          >
            {hasOpenSession ? (
              <><UserPlus className="h-3 w-3" /> Add to Class</>
            ) : (
              <><CalendarPlus className="h-3 w-3" /> Schedule</>
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

// ────────────────────────────────────────────────────────────
// Quick Enroll Popup
// ────────────────────────────────────────────────────────────

function QuickEnrollPopup({
  employee,
  training,
  sessions,
  onClose,
  onEnrolled,
}: {
  employee: string;
  training: string;
  sessions: Array<{
    id: string;
    date: string;
    time: string;
    location: string;
    enrolled: string[];
    capacity: number;
  }>;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const alreadyIn = sessions.find((s) =>
    s.enrolled.some((n) => namesMatch(n, employee))
  );

  async function handleEnroll(sessionId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, names: [employee] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Added ${employee} to the class!`);
      setTimeout(onEnrolled, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">Quick Enroll</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {employee} &rarr; {training}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">{success}</span>
            </div>
          ) : alreadyIn ? (
            <div className="flex items-center gap-3 p-3 bg-amber-50 text-amber-700 rounded-lg">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm">{employee} is already enrolled in the {alreadyIn.date} session.</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-4">
              <CalendarPlus className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">No open {training} classes</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to <a href="/schedule" className="text-blue-600 hover:text-blue-800 font-medium">Schedule</a> to create a new session first.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">Choose a session to add {employee} to:</p>
              {sessions.map((s) => {
                const spotsLeft = s.capacity - s.enrolled.length;
                const sessionDate = new Date(s.date);
                const now = new Date();
                const daysUntil = Math.ceil((sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isWithinCutoff = daysUntil < 14;
                const isPast = daysUntil < 0;

                return (
                  <button
                    key={s.id}
                    onClick={() => handleEnroll(s.id)}
                    disabled={saving}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                      isPast
                        ? "border-slate-200 bg-slate-50 opacity-60"
                        : isWithinCutoff
                          ? "border-amber-200 hover:border-amber-300 hover:bg-amber-50/50"
                          : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          {s.date}{s.time ? ` at ${s.time}` : ""}
                        </p>
                        {isWithinCutoff && !isPast && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded">
                            {daysUntil === 0 ? "TODAY" : daysUntil === 1 ? "TOMORROW" : `${daysUntil}d`}
                          </span>
                        )}
                        {isPast && (
                          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-500 text-[10px] font-semibold rounded">PAST</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {s.location || "No location"} &middot; {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {s.enrolled.length}/{s.capacity}
                      </span>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      ) : (
                        <UserPlus className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
