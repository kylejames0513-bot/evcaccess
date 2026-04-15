"use client";

import { useMemo, useState } from "react";
import { Download, UserMinus } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { formatDivision } from "@/lib/format-utils";

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
    jobTitle: string | null;
    hireDate: string | null;
    separationDate: string | null;
    tenureDays: number | null;
    tenureYears: number | null;
    daysSinceSeparation: number | null;
  }>;
}

export default function ReportsPage() {
  const { data, loading, error } = useFetch<SeparationData>("/api/reports?type=separations");
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState<"all" | "30" | "90" | "ytd" | "unknown">("all");

  const ytdStart = useMemo(() => new Date(new Date().getFullYear(), 0, 1), []);

  const divisionOptions = useMemo(() => {
    if (!data?.employees?.length) return [];
    return [
      ...new Set(data.employees.map((row) => row.division || row.department || "Unknown").filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.employees) return [];
    return data.employees.filter((row) => {
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
  }, [data, search, divisionFilter, windowFilter, ytdStart]);

  const maxTrendCount = useMemo(() => {
    if (!data?.trends?.length) return 1;
    return Math.max(...data.trends.map((m) => m.count), 1);
  }, [data]);

  if (loading) return <Loading message="Loading separation tracker..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserMinus className="h-6 w-6 text-blue-600" />
          Separation Summary
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Turnover tracker based on your synced roster and status data.
        </p>
      </div>

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

function ExportButton({ data, filename, columns }: { data: Record<string, unknown>[]; filename: string; columns: string[] }) {
  function handleExport() {
    const header = columns.join(",");
    const rows = data.map((row) =>
      columns.map((col) => {
        const val = row[col];
        return csvEscape(val);
      }).join(",")
    );
    const csv = [header, ...rows].join("\\n");
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
  const text = String(value).replace(/"/g, '""');
  return /[",\\n]/.test(text) ? `"${text}"` : text;
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
