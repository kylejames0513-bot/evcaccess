"use client";

import { useState, useEffect } from "react";
import { Search, UserMinus, UserPlus, X, Loader2, Check, Clock, XCircle, AlertTriangle, CheckCircle, CalendarPlus, ShieldOff, ShieldCheck, RefreshCw } from "lucide-react";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface EmployeesData {
  employees: Array<{
    name: string;
    position: string;
    rowIndex: number;
    completedCount: number;
    totalRequired: number;
    status: string;
    noShowCount: number;
  }>;
}

interface EmployeeDetail {
  name: string;
  trainings: Array<{
    columnKey: string;
    value: string;
    date: string | null;
    status: string;
    isExcused: boolean;
    enrolledIn: { date: string; time: string } | null;
    openSessions: Array<{
      rowIndex: number;
      training: string;
      date: string;
      time: string;
      location: string;
      enrolledCount: number;
      capacity: number;
      sortDateMs: number;
    }>;
  }>;
}

export default function EmployeesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch<EmployeesData>(`/api/employees?r=${refreshKey}`);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludedList, setExcludedList] = useState<string[]>([]);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch("/api/excluded-list")
      .then((r) => r.json())
      .then((d) => setExcludedList(d.excluded || []))
      .catch(() => {});
  }, [refreshKey]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { employees } = data;
  const filtered = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const compliant = employees.filter((e) => e.status === "current").length;
  const pctCompliant = employees.length > 0 ? Math.round((compliant / employees.length) * 100) : 0;

  async function handleExclude(name: string) {
    setExcluding(name);
    try {
      const res = await fetch("/api/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name }),
      });
      const d = await res.json();
      setExcludedList(d.excluded || []);
      setRefreshKey((k) => k + 1);
    } catch {}
    setExcluding(null);
  }

  async function handleRestore(name: string) {
    try {
      const res = await fetch("/api/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", name }),
      });
      const d = await res.json();
      setExcludedList(d.excluded || []);
      setRefreshKey((k) => k + 1);
    } catch {}
  }

  function refresh() { setRefreshKey((k) => k + 1); }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {employees.length} tracked &middot; {pctCompliant}% compliant
              {excludedList.length > 0 && (
                <> &middot; <button onClick={() => setShowExcluded(!showExcluded)} className="text-blue-600 hover:text-blue-800 font-medium">{excludedList.length} excluded</button></>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {showExcluded && excludedList.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-amber-900">Excluded from Tracking</h3>
            <button onClick={() => setShowExcluded(false)} className="p-1 hover:bg-amber-100 rounded">
              <X className="h-4 w-4 text-amber-600" />
            </button>
          </div>
          <p className="text-xs text-amber-700 mb-3">Click to restore an employee to tracking.</p>
          <div className="flex flex-wrap gap-2">
            {excludedList.map((name) => (
              <button key={name} onClick={() => handleRestore(name)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100">
                <UserPlus className="h-3 w-3" /> {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <EmployeeDetailModal
          name={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onEnrolled={() => { setSelectedEmployee(null); refresh(); }}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All statuses</option>
          <option value="current">Current</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="needed">Needed</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-striped">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Division</th>
                <th className="px-5 py-3 w-64">Compliance</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((emp, i) => {
                const pct = emp.totalRequired > 0 ? Math.round((emp.completedCount / emp.totalRequired) * 100) : 0;
                const isExcluding = excluding === emp.name;
                return (
                  <tr key={i} className="hover:bg-blue-50/30 group cursor-pointer" onClick={() => setSelectedEmployee(emp.name)}>
                    <td className="px-5 py-3 text-sm font-medium text-blue-700 hover:text-blue-900">
                      {emp.name}
                      {emp.noShowCount > 0 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 rounded-full" title={`${emp.noShowCount} no-show(s)`}>
                          {emp.noShowCount} NS
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500">{emp.position || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full">
                          <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-16 text-right">{emp.completedCount}/{emp.totalRequired}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={emp.status} /></td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleExclude(emp.name)} disabled={isExcluding}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove from tracking">
                        {isExcluding ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-400">No employees match your search.</div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Employee Detail Modal
// ────────────────────────────────────────────────────────────

function EmployeeDetailModal({ name, onClose, onEnrolled }: { name: string; onClose: () => void; onEnrolled: () => void }) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [togglingExcusal, setTogglingExcusal] = useState<string | null>(null);
  const [excusingTraining, setExcusingTraining] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [detailRefresh, setDetailRefresh] = useState(0);

  useEffect(() => {
    setLoadingDetail(true);
    fetch(`/api/employee-detail?name=${encodeURIComponent(name)}&r=${detailRefresh}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setDetail(d); })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [name, detailRefresh]);

  async function handleEnroll(sessionRowIndex: number, trainingName: string) {
    setEnrolling(trainingName);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRowIndex, names: [name] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Enrolled in ${trainingName}!`);
      setTimeout(onEnrolled, 1200);
    } catch {
    } finally {
      setEnrolling(null);
    }
  }

  async function handleExcuse(columnKey: string, reason: string) {
    setTogglingExcusal(columnKey);
    setExcusingTraining(null);
    try {
      await fetch("/api/excusal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: name,
          trainingColumnKey: columnKey,
          excused: true,
          reason,
        }),
      });
      setDetailRefresh((k) => k + 1);
    } catch {}
    setTogglingExcusal(null);
  }

  async function handleUnexcuse(columnKey: string) {
    setTogglingExcusal(columnKey);
    try {
      await fetch("/api/excusal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: name,
          trainingColumnKey: columnKey,
          excused: false,
        }),
      });
      setDetailRefresh((k) => k + 1);
    } catch {}
    setTogglingExcusal(null);
  }

  const statusIcon = (status: string) => {
    if (status === "expired") return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === "expiring_soon") return <Clock className="h-4 w-4 text-amber-500" />;
    if (status === "needed") return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    if (status === "current") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    return <CheckCircle className="h-4 w-4 text-slate-400" />;
  };

  const TRAINING_NAMES: Record<string, string> = Object.fromEntries(
    TRAINING_DEFINITIONS.reduce((map, d) => {
      if (!map.has(d.columnKey)) map.set(d.columnKey, d.name);
      return map;
    }, new Map<string, string>())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">{name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Training compliance detail</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {success ? (
            <div className="p-5">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-lg">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">{success}</span>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading training details...</div>
          ) : !detail ? (
            <div className="py-12 text-center text-sm text-slate-400">Could not load employee details.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {detail.trainings.map((t) => {
                const displayName = TRAINING_NAMES[t.columnKey] || t.columnKey;
                const needsAction = t.status === "expired" || t.status === "expiring_soon" || t.status === "needed";

                return (
                  <div key={t.columnKey} className={`px-5 py-4 ${needsAction ? "bg-red-50/30" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {statusIcon(t.status)}
                        <div>
                          <p className="text-sm font-medium text-slate-900">{displayName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {t.isExcused ? `Excused (${t.value})` : t.date ? `Completed ${t.date}` : "No date on file"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        {togglingExcusal === t.columnKey ? (
                          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                        ) : t.isExcused ? (
                          <button
                            onClick={() => handleUnexcuse(t.columnKey)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title={`Remove excusal (currently: ${t.value})`}
                          >
                            <ShieldOff className="h-3 w-3" /> Unexcuse
                          </button>
                        ) : excusingTraining === t.columnKey ? (
                          <ExcusalPicker
                            onSelect={(reason) => handleExcuse(t.columnKey, reason)}
                            onCancel={() => setExcusingTraining(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setExcusingTraining(t.columnKey)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                            title="Mark as excused"
                          >
                            <ShieldCheck className="h-3 w-3" /> Excuse
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Enrolled info */}
                    {t.enrolledIn && (
                      <div className="mt-2 ml-7 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md ring-1 ring-inset ring-blue-600/20">
                        <CalendarPlus className="h-3 w-3" />
                        Scheduled {t.enrolledIn.date}{t.enrolledIn.time ? ` at ${t.enrolledIn.time}` : ""}
                      </div>
                    )}

                    {/* Open sessions to enroll in */}
                    {needsAction && !t.enrolledIn && t.openSessions.length > 0 && (
                      <div className="mt-2 ml-7 space-y-1.5">
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Available classes:</p>
                        {t.openSessions.map((s) => {
                          const spotsLeft = s.capacity - s.enrolledCount;
                          const isEnrolling = enrolling === t.columnKey;
                          return (
                            <button
                              key={s.rowIndex}
                              onClick={() => handleEnroll(s.rowIndex, displayName)}
                              disabled={isEnrolling}
                              className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left"
                            >
                              <div>
                                <p className="text-xs font-medium text-slate-900">
                                  {s.date}{s.time ? ` at ${s.time}` : ""}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {s.location || "No location"} &middot; {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""}
                                </p>
                              </div>
                              {isEnrolling ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              ) : (
                                <UserPlus className="h-4 w-4 text-blue-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {needsAction && !t.enrolledIn && t.openSessions.length === 0 && (
                      <p className="mt-2 ml-7 text-xs text-slate-400">
                        No open classes — <a href="/schedule" className="text-blue-600 hover:text-blue-800 font-medium">schedule one</a>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Excusal Reason Picker
// ────────────────────────────────────────────────────────────

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
];

function ExcusalPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (reason: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        autoFocus
        defaultValue=""
        onChange={(e) => { if (e.target.value) onSelect(e.target.value); }}
        className="px-2 py-1 border border-slate-200 rounded-md text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="" disabled>Reason...</option>
        {EXCUSAL_REASONS.map((r) => (
          <option key={r.code} value={r.code}>{r.label}</option>
        ))}
      </select>
      <button
        onClick={onCancel}
        className="p-0.5 text-slate-400 hover:text-slate-600"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
