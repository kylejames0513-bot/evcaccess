"use client";

import { useState } from "react";
import { AlertTriangle, Clock, CheckCircle, XCircle, Filter } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";

// Demo compliance data — will come from employee_compliance view
const demoCompliance = [
  { employee: "Brown, Marcus", training: "Ukeru", status: "expired" as const, date: "2026-03-28", department: "Residential" },
  { employee: "Brown, Marcus", training: "CPR/FA", status: "expired" as const, date: "2026-02-15", department: "Residential" },
  { employee: "Smith, Terrence", training: "Med Recert", status: "expiring_soon" as const, date: "2026-04-08", department: "Residential" },
  { employee: "Johnson, Maria", training: "CPR/FA", status: "expiring_soon" as const, date: "2026-04-15", department: "Residential" },
  { employee: "Williams, Aisha", training: "CPR/FA", status: "expiring_soon" as const, date: "2026-04-22", department: "Residential" },
  { employee: "Davis, Patricia", training: "CPR/FA", status: "expiring_soon" as const, date: "2026-04-30", department: "Day Program" },
  { employee: "Davis, Patricia", training: "Mealtime", status: "needed" as const, date: null, department: "Day Program" },
  { employee: "Thompson, Kevin", training: "Safety Care", status: "needed" as const, date: null, department: "Residential" },
  { employee: "Lewis, Angela", training: "Meaningful Day", status: "needed" as const, date: null, department: "Day Program" },
  { employee: "Harris, DeShawn", training: "CPR/FA", status: "expired" as const, date: "2026-01-20", department: "Residential" },
  { employee: "Clark, Jennifer", training: "Ukeru", status: "expiring_soon" as const, date: "2026-05-01", department: "Residential" },
  { employee: "Martinez, Carlos", training: "CPR/FA", status: "needed" as const, date: null, department: "Residential" },
];

export default function CompliancePage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [trainingFilter, setTrainingFilter] = useState<string>("all");

  const expired = demoCompliance.filter((c) => c.status === "expired");
  const expiring = demoCompliance.filter((c) => c.status === "expiring_soon");
  const needed = demoCompliance.filter((c) => c.status === "needed");

  const trainings = [...new Set(demoCompliance.map((c) => c.training))].sort();

  const filtered = demoCompliance.filter((c) => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesTraining = trainingFilter === "all" || c.training === trainingFilter;
    return matchesStatus && matchesTraining;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance Report</h1>
        <p className="text-slate-500 mt-1">
          Training compliance issues across all employees
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Expired"
          value={expired.length}
          subtitle="Need immediate action"
          icon={XCircle}
          color="red"
        />
        <StatCard
          title="Expiring Soon"
          value={expiring.length}
          subtitle="Within 60 days"
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Needed"
          value={needed.length}
          subtitle="Never completed"
          icon={AlertTriangle}
          color="purple"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Issues</option>
          <option value="expired">Expired Only</option>
          <option value="expiring_soon">Expiring Soon Only</option>
          <option value="needed">Needed Only</option>
        </select>
        <select
          value={trainingFilter}
          onChange={(e) => setTrainingFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Trainings</option>
          {trainings.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Compliance table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Department</th>
                <th className="px-6 py-3">Training</th>
                <th className="px-6 py-3">Expiration / Status</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {item.employee}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {item.department}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {item.training}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {item.date || "Never completed"}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      Enroll
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No compliance issues match your filters.
        </div>
      )}
    </div>
  );
}
