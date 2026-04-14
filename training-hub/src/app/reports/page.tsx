"use client";

import { useState } from "react";
import { Download, Building2, GraduationCap, CalendarDays, Users, UserMinus } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { formatDivision } from "@/lib/format-utils";

type Tab = "department" | "training" | "forecast" | "needs" | "separations";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "department", label: "Department Compliance", icon: Building2 },
  { key: "training", label: "Training Completion", icon: GraduationCap },
  { key: "forecast", label: "Expiration Forecast", icon: CalendarDays },
  { key: "needs", label: "Who Needs What", icon: Users },
  { key: "separations", label: "Separation Summary", icon: UserMinus },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("department");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Compliance and HR analytics in one place</p>
      </div>

      {/* Tab bar */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-max min-w-full lg:min-w-0 lg:w-fit">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "department" && <DepartmentReport />}
      {tab === "training" && <TrainingReport />}
      {tab === "forecast" && <ForecastReport />}
      {tab === "needs" && <NeedsReport />}
      {tab === "separations" && <SeparationReport />}
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Compliance by Division</h2>
        <ExportButton data={departments} filename="department-compliance" columns={["division", "employeeCount", "complianceRate", "expired", "expiring", "needed"]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3">Division</th>
              <th className="px-5 py-3">Employees</th>
              <th className="px-5 py-3">Compliance</th>
              <th className="px-5 py-3 w-48">Rate</th>
              <th className="px-5 py-3">Expired</th>
              <th className="px-5 py-3">Expiring</th>
              <th className="px-5 py-3">Needed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((dept) => (
              <tr key={dept.division} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{formatDivision(dept.division)}</td>
                <td className="px-5 py-3 text-slate-600">{dept.employeeCount}</td>
                <td className="px-5 py-3">
                  <span className={`font-bold ${dept.complianceRate >= 80 ? "text-emerald-600" : dept.complianceRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {dept.complianceRate}%
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${dept.complianceRate >= 80 ? "bg-emerald-500" : dept.complianceRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Training Completion Rates</h2>
        <ExportButton data={data.trainings} filename="training-completion" columns={["name", "applicable", "completed", "completionRate", "expired", "expiring", "needed"]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
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
          <tbody className="divide-y divide-slate-100">
            {data.trainings.map((t) => (
              <tr key={t.columnKey} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{t.renewalYears > 0 ? `${t.renewalYears}yr` : "One-time"}</td>
                <td className="px-5 py-3 text-slate-600">{t.applicable}</td>
                <td className="px-5 py-3 text-emerald-700 font-medium">{t.completed}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${t.completionRate >= 80 ? "bg-emerald-500" : t.completionRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
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
      <div className="bg-white rounded-xl border border-slate-200 p-6">
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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Training</th>
                  <th className="px-5 py-3">Expiration Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.months[expandedMonth].items.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
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
    expired: "bg-red-50 text-red-700 border border-red-200",
    expiring_soon: "bg-amber-50 text-amber-700 border border-amber-200",
    needed: "bg-purple-50 text-purple-700 border border-purple-200",
  };

  function exportNeedsCSV() {
    const rows = ["Employee,Division,Missing Trainings"];
    for (const emp of filtered) {
      const missingList = emp.missing.map((m) => `${m.training} (${m.status})`).join("; ");
      rows.push([csvEscape(emp.employee), csvEscape(emp.division), csvEscape(missingList)].join(","));
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Who Needs What ({filtered.length} employees)</h2>
        <button onClick={exportNeedsCSV} className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
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
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Division</th>
              <th className="px-5 py-3">Missing</th>
              <th className="px-5 py-3">Trainings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 100).map((emp, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{emp.employee}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{formatDivision(emp.division)}</td>
                <td className="px-5 py-3">
                  <span className="font-bold text-red-600">{emp.missing.length}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {emp.missing.map((m, j) => (
                      <span key={j} className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_COLORS[m.status] || "bg-slate-50 text-slate-600 border border-slate-200"}`}>
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
// Separation Summary Report
// ────────────────────────────────────────────────────────────

interface SeparationData {
  summary: {
    totalSeparated: number;
    separatedThisMonth: number;
    separatedLast30Days: number;
    separatedLast90Days: number;
    separatedYtd: number;
    unknownDateCount: number;
    avgTenureDays: number | null;
    avgTenureYears: number | null;
    medianTenureDays: number | null;
  };
  trends: Array<{
    month: string;
    year: number;
    yearMonth: string;
    count: number;
  }>;
  byDivision: Array<{
    division: string;
    count: number;
    percentOfTotal: number;
    avgTenureDays: number | null;
  }>;
  byDepartment: Array<{
    department: string;
    count: number;
    percentOfTotal: number;
  }>;
  employees: Array<{
    id: string;
    name: string;
    paylocityId: string | null;
    division: string | null;
    department: string | null;
    position: string | null;
    jobTitle: string | null;
    hireDate: string | null;
    separationDate: string | null;
    separationYearMonth: string | null;
    tenureDays: number | null;
    tenureYears: number | null;
    daysSinceSeparation: number | null;
  }>;
}

function SeparationReport() {
  const { data, loading, error } = useFetch<SeparationData>("/api/reports?type=separations");
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState<"all" | "30" | "90" | "ytd" | "unknown">("all");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const divisionOptions = [
    ...new Set(
      data.employees
        .map((row) => row.division || row.department || "Unknown")
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const filtered = data.employees.filter((row) => {
    const haystack = `${row.name} ${row.paylocityId ?? ""} ${row.jobTitle ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());

    const divisionKey = row.division || row.department || "Unknown";
    const matchesDivision = divisionFilter === "all" || divisionKey === divisionFilter;

    let matchesWindow = true;
    if (windowFilter === "30") matchesWindow = row.daysSinceSeparation != null && row.daysSinceSeparation < 30;
    else if (windowFilter === "90") matchesWindow = row.daysSinceSeparation != null && row.daysSinceSeparation < 90;
    else if (windowFilter === "unknown") matchesWindow = !row.separationDate;
    else if (windowFilter === "ytd") {
      const parsed = parseDateOnlyLocal(row.separationDate);
      matchesWindow = parsed ? parsed >= ytdStart : false;
    }

    return matchesSearch && matchesDivision && matchesWindow;
  });

  const maxTrendCount = Math.max(...data.trends.map((m) => m.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryStatCard label="Total Separated" value={data.summary.totalSeparated} tone="slate" />
        <SummaryStatCard label="This Month" value={data.summary.separatedThisMonth} tone="blue" />
        <SummaryStatCard label="Last 30 Days" value={data.summary.separatedLast30Days} tone="red" />
        <SummaryStatCard label="Last 90 Days" value={data.summary.separatedLast90Days} tone="amber" />
        <SummaryStatCard
          label="Average Tenure"
          value={formatTenure(data.summary.avgTenureDays)}
          subtext={data.summary.avgTenureYears != null ? `${data.summary.avgTenureYears} years` : undefined}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="bg-white rounded-xl border border-slate-200 p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">12-Month Separation Trend</h3>
          <p className="text-xs text-slate-500 mt-1">Monthly count of terminated employee records</p>
          <div className="mt-4 grid grid-cols-12 gap-2 items-end h-44">
            {data.trends.map((item) => {
              const height = Math.max((item.count / maxTrendCount) * 100, item.count > 0 ? 8 : 2);
              return (
                <div key={item.yearMonth} className="flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] font-semibold text-slate-500 mb-1">{item.count || ""}</span>
                  <div
                    className="w-full rounded-t bg-blue-400 hover:bg-blue-500 transition-colors"
                    style={{ height: `${height}%`, minHeight: item.count > 0 ? "6px" : "2px" }}
                  />
                  <span className="text-[10px] text-slate-500 mt-1">{item.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <SummaryLine label="YTD Separations" value={data.summary.separatedYtd} />
            <SummaryLine label="Unknown Separation Date" value={data.summary.unknownDateCount} />
            <SummaryLine
              label="Median Tenure"
              value={data.summary.medianTenureDays != null ? formatTenure(data.summary.medianTenureDays) : "—"}
            />
          </dl>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Separations by Division</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Division</th>
                  <th className="px-4 py-3">Count</th>
                  <th className="px-4 py-3">% of Total</th>
                  <th className="px-4 py-3">Avg Tenure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byDivision.slice(0, 8).map((row) => (
                  <tr key={row.division} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{formatDivision(row.division)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.count}</td>
                    <td className="px-4 py-3 text-slate-500">{row.percentOfTotal}%</td>
                    <td className="px-4 py-3 text-slate-500">{formatTenure(row.avgTenureDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Separations by Department</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Count</th>
                  <th className="px-4 py-3">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byDepartment.slice(0, 8).map((row) => (
                  <tr key={row.department} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.department}</td>
                    <td className="px-4 py-3 text-slate-700">{row.count}</td>
                    <td className="px-4 py-3 text-slate-500">{row.percentOfTotal}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Employee Separation Detail ({filtered.length})</h2>
          <ExportButton
            data={filtered}
            filename="separation-summary"
            columns={[
              "name",
              "paylocityId",
              "division",
              "department",
              "jobTitle",
              "hireDate",
              "separationDate",
              "tenureYears",
              "tenureDays",
              "daysSinceSeparation",
            ]}
          />
        </div>
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search employee, ID, or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
          />
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All divisions</option>
            {divisionOptions.map((division) => (
              <option key={division} value={division}>
                {formatDivision(division)}
              </option>
            ))}
          </select>
          <select
            value={windowFilter}
            onChange={(e) => setWindowFilter(e.target.value as "all" | "30" | "90" | "ytd" | "unknown")}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All separations</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="ytd">YTD</option>
            <option value="unknown">Unknown date</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Paylocity ID</th>
                <th className="px-5 py-3">Division</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Hire Date</th>
                <th className="px-5 py-3">Separation Date</th>
                <th className="px-5 py-3">Tenure</th>
                <th className="px-5 py-3">Days Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 200).map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    {row.jobTitle && <div className="text-xs text-slate-500">{row.jobTitle}</div>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{row.paylocityId || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{formatDivision(row.division || row.department || "Unknown")}</td>
                  <td className="px-5 py-3 text-slate-500">{row.department || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDateShort(row.hireDate)}</td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{formatDateShort(row.separationDate)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatTenure(row.tenureDays)}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {row.daysSinceSeparation == null ? "—" : `${row.daysSinceSeparation}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">No separations match your filters.</div>
          )}
          {filtered.length > 200 && (
            <div className="px-6 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
              Showing first 200 of {filtered.length} employee records
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStatCard({
  label,
  value,
  subtext,
  tone,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone: "slate" | "blue" | "red" | "amber" | "emerald";
}) {
  const toneClass: Record<typeof tone, string> = {
    slate: "text-slate-700 bg-slate-50 border-slate-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    red: "text-red-700 bg-red-50 border-red-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClass[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subtext && <p className="text-xs mt-1 opacity-80">{subtext}</p>}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
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
        return csvEscape(val);
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
    <button onClick={handleExport} className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
      <Download className="h-3 w-3" /> CSV
    </button>
  );
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value).replace(/"/g, "\"\"");
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function parseDateOnlyLocal(value: string | null): Date | null {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateShort(value: string | null): string {
  if (!value) return "—";
  const parsed = parseDateOnlyLocal(value);
  if (!parsed) return value;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
}

function formatTenure(days: number | null): string {
  if (days == null) return "—";
  if (days < 30) return `${days}d`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0) return `${months}mo`;
  if (months === 0) return `${years}y`;
  return `${years}y ${months}mo`;
}
