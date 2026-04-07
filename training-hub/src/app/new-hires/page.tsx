"use client";

import { useState } from "react";
import { RefreshCw, UserPlus, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { formatDivision } from "@/lib/format-utils";
import EmployeeDetailModal from "@/components/EmployeeDetailModal";

interface NewHire {
  name: string;
  division: string;
  hireDate: string;
  daysEmployed: number;
  row: number;
  totalTrainings: number;
  completedTrainings: number;
  missingTrainings: string[];
}

interface NewHiresData { newHires: NewHire[]; }

export default function NewHiresPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [enrollingAll, setEnrollingAll] = useState<string | null>(null);

  const { data, loading, error } = useFetch<NewHiresData>(`/api/new-hires?r=${refreshKey}`);

  if (loading) return <Loading message="Finding new hires..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { newHires } = data;

  async function doRefresh() {
    setRefreshing(true);
    try { await fetch("/api/refresh", { method: "POST" }); setRefreshKey((k) => k + 1); } catch {}
    setRefreshing(false);
  }

  async function handleEnrollAll(hire: NewHire) {
    setEnrollingAll(hire.name);
    try {
      // Get all scheduled sessions
      const schedRes = await fetch("/api/schedule");
      const schedData = await schedRes.json();
      const sessions = schedData.sessions || [];

      let enrolled = 0;
      for (const training of hire.missingTrainings) {
        // Find next available session for this training
        const session = sessions.find(
          (s: { status: string; training: string; enrolled: string[]; capacity: number }) =>
            s.status === "scheduled" &&
            s.training.toLowerCase() === training.toLowerCase() &&
            s.enrolled.length < s.capacity
        );
        if (session) {
          await fetch("/api/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionRowIndex: session.rowIndex, names: [hire.name] }),
          });
          enrolled++;
        }
      }

      if (enrolled > 0) {
        alert(`Enrolled ${hire.name} in ${enrolled} upcoming session(s).`);
        doRefresh();
      } else {
        alert(`No available sessions found for ${hire.name}'s missing trainings.`);
      }
    } catch {}
    setEnrollingAll(null);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Hires</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Employees hired within 90 days or with zero training completions — {newHires.length} found
          </p>
        </div>
        <button onClick={doRefresh} disabled={refreshing} className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {selectedEmployee && (
        <EmployeeDetailModal
          name={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onEnrolled={() => { setSelectedEmployee(null); doRefresh(); }}
        />
      )}

      {newHires.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-slate-900">No new hires need attention</h3>
          <p className="text-xs text-slate-400 mt-1">All recent hires have training completions on file.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Division</th>
                  <th className="px-5 py-3">Hire Date</th>
                  <th className="px-5 py-3">Days</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Missing Trainings</th>
                  <th className="px-5 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {newHires.map((hire) => {
                  const pct = hire.totalTrainings > 0 ? Math.round((hire.completedTrainings / hire.totalTrainings) * 100) : 0;
                  return (
                    <tr key={hire.name} className="hover:bg-blue-50/30 group">
                      <td
                        className="px-5 py-3 text-sm font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                        onClick={() => setSelectedEmployee(hire.name)}
                      >
                        {hire.name}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{hire.division ? formatDivision(hire.division) : "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500 font-mono">{hire.hireDate || "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">
                        {hire.daysEmployed >= 0 ? (
                          <span className={hire.daysEmployed <= 30 ? "text-emerald-600 font-medium" : hire.daysEmployed <= 60 ? "text-amber-600" : "text-red-600"}>
                            {hire.daysEmployed}d
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full w-20">
                            <div className={`h-2 rounded-full ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-10">{hire.completedTrainings}/{hire.totalTrainings}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {hire.missingTrainings.slice(0, 5).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] rounded font-medium">{t}</span>
                          ))}
                          {hire.missingTrainings.length > 5 && (
                            <span className="text-[10px] text-slate-400">+{hire.missingTrainings.length - 5} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleEnrollAll(hire)}
                          disabled={enrollingAll === hire.name || hire.missingTrainings.length === 0}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {enrollingAll === hire.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                          Enroll All
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
