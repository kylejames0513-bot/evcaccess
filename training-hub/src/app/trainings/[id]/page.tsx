"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface TrainingType {
  id: number;
  name: string;
  column_key: string;
  renewal_years: number;
}

interface ComplianceRow {
  employee_id: string | null;
  last_name: string | null;
  first_name: string | null;
  department: string | null;
  status: string | null;
  completion_date: string | null;
  expiration_date: string | null;
  days_overdue: number | null;
}

interface HistoryRow {
  training_record_id: string;
  employee_id: string | null;
  last_name: string | null;
  first_name: string | null;
  completion_date: string | null;
  source: string | null;
}

interface DetailPayload {
  training: TrainingType;
  history: HistoryRow[];
  compliance: ComplianceRow[];
}

export default function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/training-detail?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 m-6">{error}</div>;
  if (!data) return <div className="p-6 text-slate-400">Loading...</div>;

  const t = data.training;
  const grouped = data.compliance.reduce<Record<string, ComplianceRow[]>>((acc, row) => {
    const key = row.status ?? "unknown";
    (acc[key] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-3 sm:p-6">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h1 className="text-2xl font-bold text-slate-900">{t.name}</h1>
        <dl className="grid grid-cols-3 gap-2 mt-3">
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Column key</dt><dd className="text-sm text-slate-900">{t.column_key}</dd></div>
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Renewal</dt><dd className="text-sm text-slate-900">{t.renewal_years > 0 ? `${t.renewal_years} years` : "One-and-done"}</dd></div>
          <div><dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active employees</dt><dd className="text-sm text-slate-900">{data.compliance.length}</dd></div>
        </dl>
      </div>

      {(["expired", "needed", "expiring_soon", "current", "excused"] as const).map((status) => {
        const rows = grouped[status] ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={status}>
            <h2 className="text-lg font-bold text-slate-900 mb-2 capitalize">{status.replace("_", " ")} ({rows.length})</h2>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Employee</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Department</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Completed</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Expires</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Days overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={`${status}-${r.employee_id}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          {r.employee_id ? (
                            <Link href={`/employees/${r.employee_id}`} className="text-blue-600 hover:text-blue-800">
                              {r.last_name}, {r.first_name}
                            </Link>
                          ) : (
                            <span className="text-slate-900">{r.last_name}, {r.first_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-900">{r.department ?? ""}</td>
                        <td className="px-3 py-2 text-slate-900">{r.completion_date ?? ""}</td>
                        <td className="px-3 py-2 text-slate-900">{r.expiration_date ?? ""}</td>
                        <td className="px-3 py-2 text-right text-slate-900">{r.days_overdue ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
