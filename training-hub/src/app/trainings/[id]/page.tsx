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

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-gray-500">Loading...</div>;

  const t = data.training;
  const grouped = data.compliance.reduce<Record<string, ComplianceRow[]>>((acc, row) => {
    const key = row.status ?? "unknown";
    (acc[key] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="p-3 sm:p-6 max-w-full sm:max-w-6xl mx-auto">
      <div className="bg-white rounded shadow p-4 mb-6">
        <h1 className="text-2xl font-bold">{t.name}</h1>
        <dl className="grid grid-cols-3 gap-2 text-sm mt-2">
          <div><dt className="text-gray-500">Column key</dt><dd>{t.column_key}</dd></div>
          <div><dt className="text-gray-500">Renewal</dt><dd>{t.renewal_years > 0 ? `${t.renewal_years} years` : "One-and-done"}</dd></div>
          <div><dt className="text-gray-500">Active employees</dt><dd>{data.compliance.length}</dd></div>
        </dl>
      </div>

      {(["expired", "needed", "expiring_soon", "current", "excused"] as const).map((status) => {
        const rows = grouped[status] ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={status} className="mb-6">
            <h2 className="text-xl font-bold mb-2 capitalize">{status.replace("_", " ")} ({rows.length})</h2>
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Completed</th>
                    <th className="px-3 py-2 text-left">Expires</th>
                    <th className="px-3 py-2 text-right">Days overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${status}-${r.employee_id}`} className="border-t">
                      <td className="px-3 py-2">
                        {r.employee_id ? (
                          <Link href={`/employees/${r.employee_id}`} className="text-blue-600 hover:underline">
                            {r.last_name}, {r.first_name}
                          </Link>
                        ) : (
                          `${r.last_name}, ${r.first_name}`
                        )}
                      </td>
                      <td className="px-3 py-2">{r.department ?? ""}</td>
                      <td className="px-3 py-2">{r.completion_date ?? ""}</td>
                      <td className="px-3 py-2">{r.expiration_date ?? ""}</td>
                      <td className="px-3 py-2 text-right">{r.days_overdue ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
