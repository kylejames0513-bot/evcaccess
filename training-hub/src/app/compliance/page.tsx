"use client";

import { useState, useEffect } from "react";
import { XCircle, Clock, AlertTriangle, UserPlus, Loader2, Check, X, CalendarPlus } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import type { ComplianceStatus } from "@/types/database";

interface ComplianceData {
  issues: Array<{
    employee: string;
    training: string;
    status: ComplianceStatus;
    date: string | null;
    expirationDate: string | null;
  }>;
}

interface ScheduleData {
  sessions: Array<{
    rowIndex: number;
    training: string;
    date: string;
    time: string;
    location: string;
    enrolled: string[];
    capacity: number;
    status: "scheduled" | "completed";
  }>;
}

export default function CompliancePage() {
  const { data, loading, error } = useFetch<ComplianceData>("/api/compliance");
  const { data: scheduleData } = useFetch<ScheduleData>("/api/schedule");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [trainingFilter, setTrainingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [enrollPopup, setEnrollPopup] = useState<{ employee: string; training: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-fetch schedule after enrollment
  const { data: freshSchedule } = useFetch<ScheduleData>(`/api/schedule?r=${refreshKey}`);
  const schedSessions = (freshSchedule || scheduleData)?.sessions || [];

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { issues } = data;
  const expired = issues.filter((c) => c.status === "expired");
  const expiring = issues.filter((c) => c.status === "expiring_soon");
  const needed = issues.filter((c) => c.status === "needed");
  const trainings = [...new Set(issues.map((c) => c.training))].sort();

  const filtered = issues.filter((c) => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesTraining = trainingFilter === "all" || c.training === trainingFilter;
    const matchesSearch = !search || c.employee.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesTraining && matchesSearch;
  });

  // Check if there's an open session for a training
  function getOpenSessions(trainingName: string) {
    return schedSessions
      .filter(
        (s) => s.status === "scheduled" &&
          s.training.toLowerCase() === trainingName.toLowerCase() &&
          s.enrolled.length < s.capacity
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">{issues.length} total issues — sorted by date</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Expired" value={expired.length} subtitle="Immediate action" icon={XCircle} color="red" />
        <StatCard title="Expiring" value={expiring.length} subtitle="Within 60 days" icon={Clock} color="yellow" />
        <StatCard title="Needed" value={needed.length} subtitle="Never completed" icon={AlertTriangle} color="purple" />
      </div>

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
        <span className="ml-auto text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Quick Enroll Popup */}
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
          <table className="w-full table-striped">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Training</th>
                <th className="px-5 py-3">Last Completed</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item, i) => {
                const openSessions = getOpenSessions(item.training);
                const hasOpenSession = openSessions.length > 0;

                // Check if employee is already enrolled in a session for this training
                const enrolledSession = schedSessions.find(
                  (s) => s.status === "scheduled" &&
                    s.training.toLowerCase() === item.training.toLowerCase() &&
                    s.enrolled.some((n) => n.toLowerCase() === item.employee.toLowerCase())
                );

                return (
                  <tr key={i} className={`hover:bg-blue-50/30 group ${enrolledSession ? "bg-emerald-50/30" : ""}`}>
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{item.employee}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{item.training}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{item.date || "—"}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{item.expirationDate || "—"}</td>
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
                          onClick={() => setEnrollPopup({ employee: item.employee, training: item.training })}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                            hasOpenSession
                              ? "bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-inset ring-blue-600/20"
                              : "bg-slate-50 text-slate-500 hover:bg-slate-100 ring-1 ring-inset ring-slate-500/10"
                          }`}
                        >
                          {hasOpenSession ? (
                            <>
                              <UserPlus className="h-3 w-3" />
                              Add to Class
                            </>
                          ) : (
                            <>
                              <CalendarPlus className="h-3 w-3" />
                              Schedule
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-400">No compliance issues match your filters.</div>
        )}
      </div>
    </div>
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
    rowIndex: number;
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

  // Check if already enrolled in any session
  const alreadyIn = sessions.find((s) =>
    s.enrolled.some((n) => n.toLowerCase() === employee.toLowerCase())
  );

  async function handleEnroll(sessionRowIndex: number) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRowIndex, names: [employee] }),
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
                    key={s.rowIndex}
                    onClick={() => handleEnroll(s.rowIndex)}
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
