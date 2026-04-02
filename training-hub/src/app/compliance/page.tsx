"use client";

import { useState } from "react";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
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
    return matchesStatus && matchesTraining;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance Report</h1>
        <p className="text-slate-500 mt-1">Live from your Training sheet — {issues.length} total issues</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Expired" value={expired.length} subtitle="Need immediate action" icon={XCircle} color="red" />
        <StatCard title="Expiring Soon" value={expiring.length} subtitle="Within 60 days" icon={Clock} color="yellow" />
        <StatCard title="Needed" value={needed.length} subtitle="Never completed" icon={AlertTriangle} color="purple" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Issues ({issues.length})</option>
          <option value="expired">Expired ({expired.length})</option>
          <option value="expiring_soon">Expiring Soon ({expiring.length})</option>
          <option value="needed">Needed ({needed.length})</option>
        </select>
        <select value={trainingFilter} onChange={(e) => setTrainingFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Trainings</option>
          {trainings.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Training</th>
                <th className="px-6 py-3">Last Completed</th>
                <th className="px-6 py-3">Expires</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{item.employee}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.training}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.date || "Never"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.expirationDate || "—"}</td>
                  <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">No compliance issues match your filters.</div>
        )}
      </div>
    </div>
  );
}
