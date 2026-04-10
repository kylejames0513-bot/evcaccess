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
  due_in_30: boolean | null;
  due_in_60: boolean | null;
  due_in_90: boolean | null;
}

interface DetailPayload {
  employee: Employee;
  history: HistoryRow[];
  compliance: ComplianceRow[];
}

/**
 * /employees/[id]
 *
 * Per-employee audit trail. Works for both active and terminated
 * employees. Active employees show the compliance status table on top;
 * terminated employees show only the history table.
 */
export default function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/employee-detail?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 m-6">{error}</div>;
  if (!data) return <div className="p-6 text-slate-400">Loading...</div>;

  const e = data.employee;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-3 sm:p-6">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-bold text-slate-900">
            {e.last_name}, {e.first_name}
          </h1>
          {!e.is_active && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-slate-50 text-slate-500 border-slate-200">
              Terminated{e.terminated_at ? ` ${e.terminated_at.slice(0, 10)}` : ""}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Paylocity ID</dt><dd className="text-sm text-slate-900">{e.paylocity_id ?? ""}</dd></div>
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
