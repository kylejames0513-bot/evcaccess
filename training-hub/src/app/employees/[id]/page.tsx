"use client";

import { use, useEffect, useState } from "react";

interface Employee {
  id: string;
  last_name: string;
  first_name: string;
  paylocity_id: string | null;
  is_active: boolean;
  terminated_at: string | null;
  reactivated_at: string | null;
  department: string | null;
  division: string | null;
  position: string | null;
  job_title: string | null;
  hire_date: string | null;
  aliases: string[];
}

interface HistoryRow {
  training_record_id: string;
  training_name: string | null;
  completion_date: string | null;
  expiration_date: string | null;
  source: string | null;
  pass_fail: string | null;
  reviewed_by: string | null;
}

interface ComplianceRow {
  training_type_id: number | null;
  training_name: string | null;
  status: string | null;
  completion_date: string | null;
  expiration_date: string | null;
  days_overdue: number | null;
  excusal_reason: string | null;
  due_in_30: boolean | null;
  due_in_60: boolean | null;
  due_in_90: boolean | null;
}

interface TrainingType {
  id: number;
  name: string;
  column_key: string;
}

interface DetailPayload {
  employee: Employee;
  history: HistoryRow[];
  compliance: ComplianceRow[];
}

export default function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [excusing, setExcusing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [detail, tt] = await Promise.all([
          fetch(`/api/employee-detail?id=${encodeURIComponent(id)}`).then((r) => r.json()),
          fetch("/api/training-types").then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (detail.error) setError(detail.error);
        else setData(detail);
        setTrainingTypes(tt.training_types ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function reload() {
    try {
      const [detail, tt] = await Promise.all([
        fetch(`/api/employee-detail?id=${encodeURIComponent(id)}`).then((r) => r.json()),
        fetch("/api/training-types").then((r) => r.json()),
      ]);
      if (detail.error) setError(detail.error);
      else setData(detail);
      setTrainingTypes(tt.training_types ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  async function excuseTraining(trainingTypeId: number) {
    if (!data) return;
    const tt = trainingTypes.find((t) => t.id === trainingTypeId);
    if (!tt) return;
    setExcusing(trainingTypeId);
    try {
      const res = await fetch("/api/bulk-excuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeNames: [`${data.employee.first_name} ${data.employee.last_name}`],
          trainingColumnKeys: [tt.column_key],
          reason: "N/A",
        }),
      });
      if (res.ok) await reload();
    } catch {}
    setExcusing(null);
  }

  async function setActiveStatus(nextActive: boolean) {
    if (!data) return;
    if (!nextActive) {
      const ok = window.confirm(
        `Mark ${data.employee.first_name} ${data.employee.last_name} as no longer an employee?\n\nThis sets their status to inactive and stamps a termination date. You can reactivate them later.`
      );
      if (!ok) return;
    }
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(data.employee.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      await reload();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Update failed");
    }
    setStatusSaving(false);
  }

  async function removeExcusal(trainingTypeId: number) {
    if (!data) return;
    setRemoving(trainingTypeId);
    try {
      const res = await fetch("/api/excusal/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: data.employee.id,
          training_type_id: trainingTypeId,
        }),
      });
      if (res.ok) await reload();
    } catch {}
    setRemoving(null);
  }

  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 m-6">{error}</div>;
  if (!data) return <div className="p-6 text-slate-400">Loading...</div>;

  const e = data.employee;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-3 sm:p-6">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-4">
            <h1 className="text-2xl font-bold text-slate-900">
              {e.last_name}, {e.first_name}
            </h1>
            {e.is_active ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                Active
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-slate-50 text-slate-500 border-slate-200">
                No longer employee{e.terminated_at ? ` \u00b7 ${e.terminated_at.slice(0, 10)}` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {e.is_active ? (
              <button
                onClick={() => setActiveStatus(false)}
                disabled={statusSaving}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50"
                title="Mark as no longer an employee"
              >
                {statusSaving ? "Saving..." : "Mark as no longer employee"}
              </button>
            ) : (
              <button
                onClick={() => setActiveStatus(true)}
                disabled={statusSaving}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 disabled:opacity-50"
                title="Reactivate employee"
              >
                {statusSaving ? "Saving..." : "Reactivate"}
              </button>
            )}
          </div>
        </div>
        {statusError && (
          <div className="mt-2 text-xs text-red-600">{statusError}</div>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Paylocity ID</dt><dd className="text-sm text-slate-900">{e.paylocity_id ?? ""}</dd></div>
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Division</dt><dd className="text-sm text-slate-900">{e.division ?? ""}</dd></div>
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Department</dt><dd className="text-sm text-slate-900">{e.department ?? ""}</dd></div>
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Position</dt><dd className="text-sm text-slate-900">{e.position ?? e.job_title ?? ""}</dd></div>
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Hire date</dt><dd className="text-sm text-slate-900">{e.hire_date ?? ""}</dd></div>
        </dl>
        {e.aliases && e.aliases.length > 0 && (
          <div className="mt-3 text-sm">
            <span className="text-slate-400">Aliases: </span>
            <span className="text-slate-900">{e.aliases.join(" , ")}</span>
          </div>
        )}
      </div>

      {data.compliance.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Compliance status</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Training</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Status</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Completion</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Expiration</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Days overdue</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.compliance.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-900">{c.training_name}</td>
                      <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-2 text-slate-900">{c.completion_date ?? ""}</td>
                      <td className="px-3 py-2 text-slate-900">{c.expiration_date ?? ""}</td>
                      <td className="px-3 py-2 text-right text-slate-900">{c.days_overdue ?? ""}</td>
                      <td className="px-3 py-2 text-right">
                        {c.status === "excused" ? (
                          <button
                            onClick={() => c.training_type_id && removeExcusal(c.training_type_id)}
                            disabled={removing === c.training_type_id}
                            className="text-xs text-slate-500 hover:text-red-600 font-medium disabled:opacity-50"
                          >
                            {removing === c.training_type_id ? "..." : "Remove excuse"}
                          </button>
                        ) : (
                          <button
                            onClick={() => c.training_type_id && excuseTraining(c.training_type_id)}
                            disabled={excusing === c.training_type_id}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                          >
                            {excusing === c.training_type_id ? "..." : "Excuse"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Full audit trail</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Training</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Completion date</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Expiration</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Source</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Pass/Fail</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Reviewed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.history.map((h) => (
                  <tr key={h.training_record_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-900">{h.training_name}</td>
                    <td className="px-3 py-2 text-slate-900">{h.completion_date ?? ""}</td>
                    <td className="px-3 py-2 text-slate-900">{h.expiration_date ?? ""}</td>
                    <td className="px-3 py-2 text-slate-900">{h.source ?? ""}</td>
                    <td className="px-3 py-2 text-slate-900">{h.pass_fail ?? ""}</td>
                    <td className="px-3 py-2 text-slate-900">{h.reviewed_by ?? ""}</td>
                  </tr>
                ))}
                {data.history.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No history.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 border-emerald-200",
    expiring_soon: "bg-amber-50 text-amber-700 border-amber-200",
    expired: "bg-red-50 text-red-700 border-red-200",
    needed: "bg-amber-50 text-amber-700 border-amber-200",
    excused: "bg-slate-50 text-slate-500 border-slate-200",
  };
  const cls = colors[status] ?? "bg-slate-50 text-slate-500 border-slate-200";
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${cls}`}>{status}</span>;
}
