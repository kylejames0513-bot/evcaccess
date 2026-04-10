"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface ComplianceRow {
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  position: string | null;
  paylocity_id: string | null;
  training_type_id: number | null;
  training_name: string | null;
  status: string | null;
  completion_date: string | null;
  expiration_date: string | null;
  completion_source: string | null;
  excusal_reason: string | null;
  days_overdue: number | null;
  due_in_30: boolean | null;
  due_in_60: boolean | null;
  due_in_90: boolean | null;
}

interface Summary {
  total_active_employees: number;
  status_counts: { current: number; expiring_soon: number; expired: number; needed: number; excused: number };
  tier_counts: { due_30: number; due_60: number; due_90: number; overdue: number };
}

/**
 * /compliance
 *
 * Compliance dashboard. Filter by department, position, status. CSV
 * export of the visible rows. 30/60/90/overdue tier counts up top.
 */
export default function CompliancePage() {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [department, position, status]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (position) params.set("position", position);
      if (status) params.set("status", status);
      const r = await fetch(`/api/compliance?${params.toString()}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows ?? []);
      setSummary(j.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.department && set.add(r.department));
    return [...set].sort();
  }, [rows]);

  function exportCsv() {
    const header = [
      "paylocity_id",
      "last_name",
      "first_name",
      "department",
      "position",
      "training_name",
      "status",
      "completion_date",
      "expiration_date",
      "days_overdue",
      "completion_source",
      "excusal_reason",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        header
          .map((k) => {
            const v = (r as unknown as Record<string, unknown>)[k];
            if (v == null) return "";
            const s = String(v);
            return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Compliance dashboard</h1>

      {summary && (
        <>
        <p className="text-sm text-gray-500 mb-2">{summary.total_active_employees} active employees</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
          <Stat label="Fully compliant" value={summary.status_counts.current} color="green" />
          <Stat label="Expiring soon" value={summary.status_counts.expiring_soon} color="yellow" />
          <Stat label="Expired" value={summary.status_counts.expired} color="red" />
          <Stat label="Missing training" value={summary.status_counts.needed} color="amber" />
          <Stat label="Due in 30 days" value={summary.tier_counts.due_30} color="yellow" />
          <Stat label="Due in 60 days" value={summary.tier_counts.due_60} color="blue" />
          <Stat label="Due in 90 days" value={summary.tier_counts.due_90} color="blue" />
          <Stat label="Overdue" value={summary.tier_counts.overdue} color="red" />
        </div>
        </>
      )}

      <div className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap gap-3 items-end">
        <label className="block">
          <span className="text-xs text-gray-500">Department</span>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1 block rounded border-gray-300 text-sm">
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Position</span>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="filter..."
            className="mt-1 block rounded border-gray-300 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block rounded border-gray-300 text-sm">
            <option value="">All</option>
            <option value="current">Current</option>
            <option value="expiring_soon">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="needed">Needed</option>
            <option value="excused">Excused</option>
          </select>
        </label>
        <div className="ml-auto">
          <button type="button" onClick={exportCsv} className="px-4 py-2 bg-gray-200 rounded text-sm">
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
      {loading && <div className="text-gray-500 text-sm mb-2">Loading...</div>}

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-left">Department</th>
              <th className="px-3 py-2 text-left">Training</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Completion</th>
              <th className="px-3 py-2 text-left">Expiration</th>
              <th className="px-3 py-2 text-right">Days overdue</th>
              <th className="px-3 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.employee_id}-${r.training_type_id}-${i}`} className="border-t">
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
                <td className="px-3 py-2">
                  {r.training_type_id ? (
                    <Link href={`/trainings/${r.training_type_id}`} className="text-blue-600 hover:underline">
                      {r.training_name}
                    </Link>
                  ) : (
                    r.training_name
                  )}
                </td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2">{r.completion_date ?? ""}</td>
                <td className="px-3 py-2">{r.expiration_date ?? ""}</td>
                <td className="px-3 py-2 text-right">{r.days_overdue ?? ""}</td>
                <td className="px-3 py-2 text-gray-500">{r.completion_source ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-3 py-4 text-gray-500">No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-50 text-green-800",
    yellow: "bg-yellow-50 text-yellow-800",
    blue: "bg-blue-50 text-blue-800",
    red: "bg-red-50 text-red-800",
    amber: "bg-amber-50 text-amber-800",
    gray: "bg-gray-100 text-gray-700",
  };
  return (
    <div className={`rounded p-3 ${colors[color] ?? "bg-gray-100"}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
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
