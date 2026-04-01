"use client";

import { useState } from "react";
import { Search, Plus, Filter } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";

// Demo data
const demoEmployees = [
  { id: "1", name: "Anderson, James", title: "DSP", department: "Residential", program: "Group Home A", status: "current" as const, completedCount: 12, totalRequired: 12 },
  { id: "2", name: "Brown, Marcus", title: "DSP", department: "Residential", program: "Group Home B", status: "expired" as const, completedCount: 10, totalRequired: 12 },
  { id: "3", name: "Davis, Patricia", title: "Lead DSP", department: "Day Program", program: "ELC", status: "expiring_soon" as const, completedCount: 11, totalRequired: 12 },
  { id: "4", name: "Garcia, Sofia", title: "Supervisor", department: "Residential", program: "Group Home A", status: "current" as const, completedCount: 8, totalRequired: 8 },
  { id: "5", name: "Johnson, Maria", title: "DSP", department: "Residential", program: "Group Home C", status: "expiring_soon" as const, completedCount: 11, totalRequired: 12 },
  { id: "6", name: "Miller, Robert", title: "Nurse (LPN)", department: "Health Services", program: "", status: "excused" as const, completedCount: 5, totalRequired: 5 },
  { id: "7", name: "Smith, Terrence", title: "DSP", department: "Residential", program: "Group Home B", status: "expiring_soon" as const, completedCount: 11, totalRequired: 12 },
  { id: "8", name: "Taylor, Aisha", title: "DSP", department: "Day Program", program: "Workshop", status: "current" as const, completedCount: 12, totalRequired: 12 },
  { id: "9", name: "Williams, Aisha", title: "Med Tech", department: "Residential", program: "Group Home A", status: "expiring_soon" as const, completedCount: 14, totalRequired: 15 },
  { id: "10", name: "Wilson, David", title: "DSP", department: "Residential", program: "Group Home C", status: "current" as const, completedCount: 12, totalRequired: 12 },
];

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = demoEmployees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-slate-500 mt-1">
            {demoEmployees.length} active employees
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" />
          Add Employee
        </button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="current">Current</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="needed">Needed</option>
          <option value="excused">Excused</option>
        </select>
      </div>

      {/* Employee table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Department</th>
                <th className="px-6 py-3">Program</th>
                <th className="px-6 py-3">Compliance</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((emp) => {
                const pct = Math.round(
                  (emp.completedCount / emp.totalRequired) * 100
                );

                return (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-900">
                        {emp.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {emp.title}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {emp.department}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {emp.program || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full max-w-[80px]">
                          <div
                            className={`h-2 rounded-full ${
                              pct === 100
                                ? "bg-green-500"
                                : pct >= 80
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 whitespace-nowrap">
                          {emp.completedCount}/{emp.totalRequired}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={emp.status} />
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/employees/${emp.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
