"use client";

import { useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface TrainingRecord {
  id: string;
  attendee: string;
  session: string;
  date: string;
  source: string;
  notes: string;
}

interface RecordsData {
  records: TrainingRecord[];
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export default function RecordsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch<RecordsData>(
    `/api/training-records?r=${refreshKey}`
  );
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { records } = data;

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.attendee.toLowerCase().includes(q) ||
      r.session.toLowerCase().includes(q) ||
      r.source.toLowerCase().includes(q)
    );
  });

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
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Training Records</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {records.length} record{records.length !== 1 ? "s" : ""} on file
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

      {/* Search */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search attendee, training, or source..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
          />
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-striped">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Attendee</th>
                <th className="px-5 py-3">Training</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/30">
                  <td className="px-5 py-3 text-sm text-slate-700">{r.attendee || "\u2014"}</td>
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">{r.session || "\u2014"}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{formatDate(r.date)}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{r.source || "\u2014"}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{r.notes || "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-400">
            {records.length === 0
              ? "No training records yet."
              : "No records match your search."}
          </div>
        )}
      </div>
    </div>
  );
}
