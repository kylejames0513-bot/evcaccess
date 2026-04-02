"use client";

import { useState } from "react";
import { XCircle, Clock, AlertTriangle, Download } from "lucide-react";
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

export default function CompliancePage() {
  const { data, loading, error } = useFetch<ComplianceData>("/api/compliance");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [trainingFilter, setTrainingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">{issues.length} total issues across active employees</p>
      </div>

      {/* Stats row */}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item, i) => (
                <tr key={i} className="hover:bg-blue-50/30">
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">{item.employee}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{item.training}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{item.date || "—"}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{item.expirationDate || "—"}</td>
                  <td className="px-5 py-3"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
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
