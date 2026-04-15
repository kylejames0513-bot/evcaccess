"use client";

import { useMemo, useState } from "react";
import { UserPlus, RefreshCw } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { formatDivision } from "@/lib/format-utils";

interface NewHire {
  name: string;
  employeeId: string;
  division: string;
  hireDate: string;
  daysEmployed: number;
  totalTrainings: number;
  completedTrainings: number;
  missingTrainings: string[];
}

interface NewHiresData {
  newHires: NewHire[];
}

export default function NewHiresPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const { data, loading, error } = useFetch<NewHiresData>(`/api/new-hires?r=${refreshKey}`);

  const divisionOptions = useMemo(() => {
    if (!data?.newHires?.length) return [];
    return [...new Set(data.newHires.map((n) => n.division).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.newHires) return [];
    return data.newHires.filter((hire) => {
      const matchesSearch = !search || hire.name.toLowerCase().includes(search.toLowerCase());
      const matchesDivision = divisionFilter === "all" || hire.division === divisionFilter;
      return matchesSearch && matchesDivision;
    });
  }, [data, search, divisionFilter]);

  if (loading) return <Loading message="Loading new-hire tracker..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-blue-600" />
            New Hire Training Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Last 90 days of hires with required training completion progress.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="New Hires" value={data.newHires.length} tone="blue" />
        <SummaryCard
          label="Need Attention"
          value={data.newHires.filter((n) => n.missingTrainings.length > 0).length}
          tone="amber"
        />
        <SummaryCard
          label="Fully Complete"
          value={data.newHires.filter((n) => n.missingTrainings.length === 0).length}
          tone="emerald"
        />
        <SummaryCard
          label="Avg Days Employed"
          value={
            data.newHires.length === 0
              ? 0
              : Math.round(
                  data.newHires.reduce((sum, n) => sum + n.daysEmployed, 0) /
                    data.newHires.length
                )
          }
          tone="slate"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search employee..."
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Division</th>
                <th className="px-4 py-3">Hire Date</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Missing Trainings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((hire) => {
                const pct =
                  hire.totalTrainings > 0
                    ? Math.round((hire.completedTrainings / hire.totalTrainings) * 100)
                    : 0;
                return (
                  <tr key={hire.employeeId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{hire.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDivision(hire.division || "—")}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{hire.hireDate || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{hire.daysEmployed}d</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full ${
                              pct === 100
                                ? "bg-emerald-500"
                                : pct > 0
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {hire.completedTrainings}/{hire.totalTrainings}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {hire.missingTrainings.length === 0 ? (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          Complete
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {hire.missingTrainings.slice(0, 4).map((training) => (
                            <span
                              key={training}
                              className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded"
                            >
                              {training}
                            </span>
                          ))}
                          {hire.missingTrainings.length > 4 && (
                            <span className="text-[10px] text-slate-400">
                              +{hire.missingTrainings.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No new hires match your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "blue" | "amber" | "emerald";
}) {
  const toneClass: Record<typeof tone, string> = {
    slate: "text-slate-700 bg-slate-50 border-slate-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClass[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
