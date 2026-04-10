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

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-gray-500">Loading...</div>;

  const e = data.employee;

  return (
    <div className="p-3 sm:p-6 max-w-full sm:max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-bold">
            {e.last_name}, {e.first_name}
          </h1>
          {!e.is_active && (
            <span className="text-sm bg-gray-200 text-gray-700 rounded px-2 py-0.5">
              Terminated{e.terminated_at ? ` ${e.terminated_at.slice(0, 10)}` : ""}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mt-3">
          <div><dt className="text-gray-500">Paylocity ID</dt><dd>{e.paylocity_id ?? ""}</dd></div>
          <div><dt className="text-gray-500">Department</dt><dd>{e.department ?? ""}</dd></div>
          <div><dt className="text-gray-500">Position</dt><dd>{e.position ?? e.job_title ?? ""}</dd></div>
          <div><dt className="text-gray-500">Hire date</dt><dd>{e.hire_date ?? ""}</dd></div>
        </dl>
        {e.aliases && e.aliases.length > 0 && (
          <div className="mt-3 text-sm">
            <span className="text-gray-500">Aliases: </span>
            <span>{e.aliases.join(" , ")}</span>
          </div>
        )}
      </div>

      {data.compliance.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2">Compliance status</h2>
          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Training</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Completion</th>
                  <th className="px-3 py-2 text-left">Expiration</th>
                  <th className="px-3 py-2 text-right">Days overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.compliance.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{c.training_name}</td>
                    <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-2">{c.completion_date ?? ""}</td>
                    <td className="px-3 py-2">{c.expiration_date ?? ""}</td>
                    <td className="px-3 py-2 text-right">{c.days_overdue ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold mb-2">Full audit trail</h2>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Training</th>
              <th className="px-3 py-2 text-left">Completion date</th>
              <th className="px-3 py-2 text-left">Expiration</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Pass/Fail</th>
              <th className="px-3 py-2 text-left">Reviewed by</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.training_record_id} className="border-t">
                <td className="px-3 py-2">{h.training_name}</td>
                <td className="px-3 py-2">{h.completion_date ?? ""}</td>
                <td className="px-3 py-2">{h.expiration_date ?? ""}</td>
                <td className="px-3 py-2">{h.source ?? ""}</td>
                <td className="px-3 py-2">{h.pass_fail ?? ""}</td>
                <td className="px-3 py-2">{h.reviewed_by ?? ""}</td>
              </tr>
            ))}
            {data.history.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-gray-500">No history.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    current: "bg-green-100 text-green-800",
    expiring_soon: "bg-yellow-100 text-yellow-800",
    expired: "bg-red-100 text-red-800",
    needed: "bg-amber-100 text-amber-800",
    excused: "bg-gray-100 text-gray-700",
  };
  const cls = colors[status] ?? "bg-gray-100 text-gray-700";
  return <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{status}</span>;
}
