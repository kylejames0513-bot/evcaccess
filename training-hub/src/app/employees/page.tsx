"use client";

import { useState, useEffect } from "react";
import { Search, UserMinus, UserPlus, X, Loader2, RefreshCw } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import EmployeeDetailModal from "@/components/EmployeeDetailModal";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { formatDivision } from "@/lib/format-utils";

interface EmployeesData {
  employees: Array<{
    name: string;
    employeeId: string;
    position: string;
    completedCount: number;
    totalRequired: number;
    status: string;
    noShowCount: number;
  }>;
}

export default function EmployeesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch<EmployeesData>(`/api/employees?r=${refreshKey}`);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludedList, setExcludedList] = useState<string[]>([]);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch("/api/excluded-list")
      .then((r) => r.json())
      .then((d) => setExcludedList(d.excluded || []))
      .catch(() => {});
  }, [refreshKey]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { employees } = data;
  const divisions = [...new Set(employees.map((e) => e.position).filter(Boolean))].sort();
  const filtered = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status === statusFilter;
    const matchesDivision = divisionFilter === "all" || emp.position === divisionFilter;
    return matchesSearch && matchesStatus && matchesDivision;
  });

  const compliant = employees.filter((e) => e.status === "current").length;
  const pctCompliant = employees.length > 0 ? Math.round((compliant / employees.length) * 100) : 0;

  async function handleExclude(name: string) {
    setExcluding(name);
    try {
      const res = await fetch("/api/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name }),
      });
      const d = await res.json();
      setExcludedList(d.excluded || []);
      setRefreshKey((k) => k + 1);
    } catch {}
    setExcluding(null);
  }

  async function handleRestore(name: string) {
    try {
      const res = await fetch("/api/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", name }),
      });
      const d = await res.json();
      setExcludedList(d.excluded || []);
      setRefreshKey((k) => k + 1);
    } catch {}
  }

  function refresh() { setRefreshKey((k) => k + 1); }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {employees.length} tracked &middot; {pctCompliant}% compliant
              {excludedList.length > 0 && (
                <> &middot; <button onClick={() => setShowExcluded(!showExcluded)} className="text-blue-600 hover:text-blue-800 font-medium">{excludedList.length} excluded</button></>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {showExcluded && excludedList.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-amber-900">Excluded from Tracking</h3>
            <button onClick={() => setShowExcluded(false)} className="p-1 hover:bg-amber-100 rounded">
              <X className="h-4 w-4 text-amber-600" />
            </button>
          </div>
          <p className="text-xs text-amber-700 mb-3">Click to restore an employee to tracking.</p>
          <div className="flex flex-wrap gap-2">
            {excludedList.map((name) => (
              <button key={name} onClick={() => handleRestore(name)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100">
                <UserPlus className="h-3 w-3" /> {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <EmployeeDetailModal
          name={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onEnrolled={() => { setSelectedEmployee(null); refresh(); }}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All statuses</option>
          <option value="current">Current</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="needed">Needed</option>
        </select>
        <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{formatDivision(d)}</option>)}
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
                <th className="px-5 py-3">Division</th>
                <th className="px-5 py-3 w-64">Compliance</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((emp, i) => {
                const pct = emp.totalRequired > 0 ? Math.round((emp.completedCount / emp.totalRequired) * 100) : 0;
                const isExcluding = excluding === emp.name;
                return (
                  <tr key={i} className="hover:bg-blue-50/30 group cursor-pointer" onClick={() => setSelectedEmployee(emp.name)}>
                    <td className="px-5 py-3 text-sm font-medium text-blue-700 hover:text-blue-900">
                      {emp.name}
                      {emp.noShowCount > 0 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 rounded-full" title={`${emp.noShowCount} no-show(s)`}>
                          {emp.noShowCount} NS
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500">{emp.position ? formatDivision(emp.position) : "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full">
                          <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-16 text-right">{emp.completedCount}/{emp.totalRequired}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={emp.status} /></td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleExclude(emp.name)} disabled={isExcluding}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove from tracking">
                        {isExcluding ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                      </button>
                    </td>
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

