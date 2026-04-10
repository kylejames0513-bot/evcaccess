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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance dashboard</h1>
        {summary && (
          <p className="mt-1 text-sm text-slate-500">{summary.total_active_employees} active employees</p>
        )}
      </div>

      {/* Summary stat tiles */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
          <Stat label="Fully compliant" value={summary.status_counts.current} color="green" />
          <Stat label="Expiring soon" value={summary.status_counts.expiring_soon} color="yellow" />
          <Stat label="Expired" value={summary.status_counts.expired} color="red" />
          <Stat label="Missing training" value={summary.status_counts.needed} color="amber" />
          <Stat label="Due in 30 days" value={summary.tier_counts.due_30} color="yellow" />
          <Stat label="Due in 60 days" value={summary.tier_counts.due_60} color="blue" />
          <Stat label="Due in 90 days" value={summary.tier_counts.due_90} color="blue" />
          <Stat label="Overdue" value={summary.tier_counts.overdue} color="red" />
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Department</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Position</span>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="filter..."
            className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All</option>
            <option value="current">Current</option>
            <option value="expiring_soon">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="needed">Needed</option>
            <option value="excused">Excused</option>
          </select>
        </label>
        <div className="ml-auto">
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Status messages */}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-slate-500 text-sm">Loading...</div>}

      {/* Data table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Employee</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Department</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Training</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Completion</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Expiration</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Days overdue</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={`${r.employee_id}-${r.training_type_id}-${i}`} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-900">
                  {r.employee_id ? (
                    <Link href={`/employees/${r.employee_id}`} className="text-blue-600 hover:underline font-medium">
                      {r.last_name}, {r.first_name}
                    </Link>
                  ) : (
                    `${r.last_name}, ${r.first_name}`
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.department ?? ""}</td>
                <td className="px-4 py-3 text-slate-900">
                  {r.training_type_id ? (
                    <Link href={`/trainings/${r.training_type_id}`} className="text-blue-600 hover:underline">
                      {r.training_name}
                    </Link>
                  ) : (
                    r.training_name
                  )}
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-slate-500">{r.completion_date ?? ""}</td>
                <td className="px-4 py-3 text-slate-500">{r.expiration_date ?? ""}</td>
                <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{r.days_overdue ?? ""}</td>
                <td className="px-4 py-3 text-slate-400">{r.completion_source ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const iconColors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-600",
    yellow: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-orange-50 text-orange-600",
    gray: "bg-slate-50 text-slate-500",
  };

  const dotColor: Record<string, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
    amber: "bg-orange-500",
    gray: "bg-slate-400",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${iconColors[color] ?? "bg-slate-50 text-slate-500"}`}>
        <span className={`block w-2.5 h-2.5 rounded-full ${dotColor[color] ?? "bg-slate-400"}`} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10",
    expiring_soon: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
    expired: "bg-red-50 text-red-700 ring-1 ring-red-600/10",
    needed: "bg-orange-50 text-orange-700 ring-1 ring-orange-600/10",
    excused: "bg-slate-50 text-slate-600 ring-1 ring-slate-500/10",
  };
  const cls = colors[status] ?? "bg-slate-50 text-slate-600 ring-1 ring-slate-500/10";
  return <span className={`inline-flex items-center text-xs font-medium rounded-md px-2 py-0.5 ${cls}`}>{status}</span>;
}
