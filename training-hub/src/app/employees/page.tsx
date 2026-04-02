"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface EmployeesData {
  employees: Array<{
    name: string;
    rowIndex: number;
    completedCount: number;
    totalRequired: number;
    status: string;
  }>;
}

export default function EmployeesPage() {
  const { data, loading, error } = useFetch<EmployeesData>("/api/employees");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { employees } = data;
  const filtered = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const compliant = employees.filter((e) => e.status === "current").length;
  const pctCompliant = employees.length > 0 ? Math.round((compliant / employees.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500 mt-0.5">{employees.length} active &middot; {pctCompliant}% fully compliant</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All statuses</option>
          <option value="current">Current</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="needed">Needed</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-striped">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3 w-64">Compliance</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((emp, i) => {
                const pct = emp.totalRequired > 0 ? Math.round((emp.completedCount / emp.totalRequired) * 100) : 0;
                return (
                  <tr key={i} className="hover:bg-blue-50/30">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{emp.name}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full">
                          <div
                            className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-16 text-right">
                          {emp.completedCount}/{emp.totalRequired}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={emp.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-400">No employees match your search.</div>
        )}
      </div>
    </div>
  );
}
