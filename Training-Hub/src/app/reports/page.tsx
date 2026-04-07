"use client";

import { useState } from "react";
import { Download, Building2, GraduationCap, CalendarDays, Users } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { formatDivision } from "@/lib/format-utils";

type Tab = "department" | "training" | "forecast" | "needs";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "department", label: "Department Compliance", icon: Building2 },
  { key: "training", label: "Training Completion", icon: GraduationCap },
  { key: "forecast", label: "Expiration Forecast", icon: CalendarDays },
  { key: "needs", label: "Who Needs What", icon: Users },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("department");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Training compliance analytics and insights</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "department" && <DepartmentReport />}
      {tab === "training" && <TrainingReport />}
      {tab === "forecast" && <ForecastReport />}
      {tab === "needs" && <NeedsReport />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Department Compliance Report
// ────────────────────────────────────────────────────────────

interface DeptData {
  departments: Array<{
    division: string;
    employeeCount: number;
    totalTrainings: number;
    expired: number;
    expiring: number;
    needed: number;
    compliantEmployees: number;
    complianceRate: number;
  }>;
}

function DepartmentReport() {
  const { data, loading, error } = useFetch<DeptData>("/api/reports?type=department");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { departments } = data;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Compliance by Division</h2>
        <ExportButton data={departments} filename="department-compliance" columns={["division", "employeeCount", "complianceRate", "expired", "expiring", "needed"]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="px-5 py-3">Division</th>
              <th className="px-5 py-3">Employees</th>
              <th className="px-5 py-3">Compliance</th>
              <th className="px-5 py-3 w-48">Rate</th>
              <th className="px-5 py-3">Expired</th>
              <th className="px-5 py-3">Expiring</th>
              <th className="px-5 py-3">Needed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {departments.map((dept) => (
              <tr key={dept.division} className="hover:bg-blue-50/30">
                <td className="px-5 py-3 font-medium text-slate-900">{formatDivision(dept.division)}</td>
                <td className="px-5 py-3 text-slate-600">{dept.employeeCount}</td>
                <td className="px-5 py-3">
                  <span className={`font-bold ${dept.complianceRate >= 80 ? "text-emerald-600" : dept.complianceRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {dept.complianceRate}%
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${dept.complianceRate >= 80 ? "bg-emerald-500" : dept.complianceRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${dept.complianceRate}%` }}
                    />
                  </div>
                </td>
                <td className="px-5 py-3 text-red-600 font-medium">{dept.expired || "—"}</td>
                <td className="px-5 py-3 text-amber-600 font-medium">{dept.expiring || "—"}</td>
                <td className="px-5 py-3 text-purple-600 font-medium">{dept.needed || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Training Completion Report
// ────────────────────────────────────────────────────────────

interface TrainingData {
  trainings: Array<{
    name: string;
    columnKey: string;
    renewalYears: number;
    applicable: number;
    completed: number;
    expired: number;
    expiring: number;
    needed: number;
    completionRate: number;
  }>;
}

function TrainingReport() {
  const { data, loading, error } = useFetch<TrainingData>("/api/reports?type=training");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Training Completion Rates</h2>
        <ExportButton data={data.trainings} filename="training-completion" columns={["name", "applicable", "completed", "completionRate", "expired", "expiring", "needed"]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="px-5 py-3">Training</th>
              <th className="px-5 py-3">Renewal</th>
              <th className="px-5 py-3">Applicable</th>
              <th className="px-5 py-3">Completed</th>
              <th className="px-5 py-3 w-48">Rate</th>
              <th className="px-5 py-3">Expired</th>
              <th className="px-5 py-3">Expiring</th>
              <th className="px-5 py-3">Needed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.trainings.map((t) => (
              <tr key={t.columnKey} className="hover:bg-blue-50/30">
                <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{t.renewalYears > 0 ? `${t.renewalYears}yr` : "One-time"}</td>
                <td className="px-5 py-3 text-slate-600">{t.applicable}</td>
                <td className="px-5 py-3 text-emerald-700 font-medium">{t.completed}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${t.completionRate >= 80 ? "bg-emerald-500" : t.completionRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${t.completionRate}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold w-10 text-right ${t.completionRate >= 80 ? "text-emerald-600" : t.completionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                      {t.completionRate}%
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 text-red-600 font-medium">{t.expired || "—"}</td>
                <td className="px-5 py-3 text-amber-600 font-medium">{t.expiring || "—"}</td>
                <td className="px-5 py-3 text-purple-600 font-medium">{t.needed || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Expiration Forecast Report
// ────────────────────────────────────────────────────────────

interface ForecastData {
  months: Array<{
    month: string;
    year: number;
    count: number;
    items: Array<{ employee: string; training: string; expirationDate: string }>;
  }>;
  overdue: {
    count: number;
    items: Array<{ employee: string; training: string; expirationDate: string }>;
  };
}

function ForecastReport() {
  const { data, loading, error } = useFetch<ForecastData>("/api/reports?type=forecast");
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const maxCount = Math.max(data.overdue.count, ...data.months.map((m) => m.count), 1);

  return (
    <div className="space-y-4">
      {/* Overdue banner */}
      {data.overdue.count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">{data.overdue.count} training(s) are already overdue</p>
        </div>
      )}

      {/* Forecast chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Upcoming Expirations (Next 12 Months)</h2>
        <div className="flex items-end gap-2 h-48">
          {data.months.map((m, i) => {
            const height = maxCount > 0 ? Math.max((m.count / maxCount) * 100, m.count > 0 ? 5 : 0) : 0;
            const isExpanded = expandedMonth === i;
            return (
              <button
                key={i}
                onClick={() => setExpandedMonth(isExpanded ? null : i)}
                className={`flex-1 flex flex-col items-center justify-end group ${isExpanded ? "ring-2 ring-blue-500 rounded-lg" : ""}`}
              >
                <span className="text-[10px] font-bold text-slate-600 mb-1">{m.count || ""}</span>
                <div
                  className={`w-full rounded-t transition-all ${
                    m.count === 0 ? "bg-slate-100" : i < 3 ? "bg-red-400 hover:bg-red-500" : i < 6 ? "bg-amber-400 hover:bg-amber-500" : "bg-blue-400 hover:bg-blue-500"
                  }`}
                  style={{ height: `${height}%`, minHeight: m.count > 0 ? "4px" : "2px" }}
                />
                <span className="text-[10px] text-slate-500 mt-1">{m.month}</span>
                <span className="text-[9px] text-slate-400">{m.year}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded month details */}
      {expandedMonth !== null && data.months[expandedMonth].items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              {data.months[expandedMonth].month} {data.months[expandedMonth].year} — {data.months[expandedMonth].count} expiration(s)
            </h2>
            <ExportButton
              data={data.months[expandedMonth].items}
              filename={`expirations-${data.months[expandedMonth].month}-${data.months[expandedMonth].year}`}
              columns={["employee", "training", "expirationDate"]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Training</th>
                  <th className="px-5 py-3">Expiration Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.months[expandedMonth].items.map((item, i) => (
                  <tr key={i} className="hover:bg-blue-50/30">
                    <td className="px-5 py-3 font-medium text-slate-900">{item.employee}</td>
                    <td className="px-5 py-3 text-slate-600">{item.training}</td>
                    <td className="px-5 py-3 text-slate-500">{item.expirationDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Who Needs What Report
// ────────────────────────────────────────────────────────────

interface NeedsData {
  employees: Array<{
    employee: string;
    division: string;
    missing: Array<{ training: string; status: string }>;
  }>;
}

function NeedsReport() {
  const { data, loading, error } = useFetch<NeedsData>("/api/reports?type=needs");
  const [search, setSearch] = useState("");
  const [divFilter, setDivFilter] = useState("all");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const divisions = [...new Set(data.employees.map((e) => e.division).filter(Boolean))].sort();
  const filtered = data.employees.filter((e) => {
    const matchesSearch = !search || e.employee.toLowerCase().includes(search.toLowerCase());
    const matchesDivision = divFilter === "all" || e.division === divFilter;
    return matchesSearch && matchesDivision;
  });

  const STATUS_COLORS: Record<string, string> = {
    expired: "bg-red-100 text-red-700",
    expiring_soon: "bg-amber-100 text-amber-700",
    needed: "bg-purple-100 text-purple-700",
  };

  function exportNeedsCSV() {
    const rows = ["Employee,Division,Missing Trainings"];
    for (const emp of filtered) {
      const missingList = emp.missing.map((m) => `${m.training} (${m.status})`).join("; ");
      rows.push(`"${emp.employee}","${emp.division}","${missingList}"`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `who-needs-what-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Who Needs What ({filtered.length} employees)</h2>
        <button onClick={exportNeedsCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      <div className="px-6 py-3 border-b border-slate-100 flex gap-3">
        <input
          type="text"
          placeholder="Search employee..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select value={divFilter} onChange={(e) => setDivFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{formatDivision(d)}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Division</th>
              <th className="px-5 py-3">Missing</th>
              <th className="px-5 py-3">Trainings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.slice(0, 100).map((emp, i) => (
              <tr key={i} className="hover:bg-blue-50/30">
                <td className="px-5 py-3 font-medium text-slate-900">{emp.employee}</td>
                <td className="px-5 py-3 text-slate-600 text-xs">{formatDivision(emp.division)}</td>
                <td className="px-5 py-3">
                  <span className="font-bold text-red-600">{emp.missing.length}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {emp.missing.map((m, j) => (
                      <span key={j} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[m.status] || "bg-slate-100 text-slate-600"}`}>
                        {m.training}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div className="px-6 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
            Showing first 100 of {filtered.length} employees
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Shared CSV Export Button
// ────────────────────────────────────────────────────────────

function ExportButton({ data, filename, columns }: { data: Record<string, unknown>[]; filename: string; columns: string[] }) {
  function handleExport() {
    const header = columns.join(",");
    const rows = data.map((row) =>
      columns.map((col) => {
        const val = row[col];
        return typeof val === "string" && val.includes(",") ? `"${val}"` : String(val ?? "");
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">
      <Download className="h-3 w-3" /> CSV
    </button>
  );
}
