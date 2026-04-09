"use client";

import { useState } from "react";
import { Search, CheckCircle, XCircle, Clock, CheckSquare, Square, Loader2, RefreshCw } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface TrainingRecord {
  id: string;
  arrivalTime: string;
  session: string;
  attendee: string;
  date: string;
  leftEarly: string;
  reason: string;
  notes: string;
  endTime: string;
  sessionLength: string;
  passFail: string;
  reviewedBy: string;
}

interface RecordsData {
  records: TrainingRecord[];
  pendingCount: number;
  passCount: number;
  failCount: number;
}

type FilterTab = "all" | "pending" | "passed" | "failed";

function isPending(r: TrainingRecord) {
  return !r.passFail || r.passFail.toLowerCase() === "pending";
}
function isPassed(r: TrainingRecord) {
  return r.passFail.toLowerCase() === "pass";
}
function isFailed(r: TrainingRecord) {
  return r.passFail.toLowerCase() === "fail";
}

function statusColor(r: TrainingRecord) {
  if (isPassed(r)) return "bg-emerald-100 text-emerald-700";
  if (isFailed(r)) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function statusLabel(r: TrainingRecord) {
  if (isPassed(r)) return "Pass";
  if (isFailed(r)) return "Fail";
  return "Pending";
}

export default function RecordsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch<RecordsData>(`/api/training-records?r=${refreshKey}`);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewedBy, setReviewedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { records, pendingCount, passCount, failCount } = data;

  // Filter records
  const filtered = records.filter((r) => {
    // Tab filter
    if (tab === "pending" && !isPending(r)) return false;
    if (tab === "passed" && !isPassed(r)) return false;
    if (tab === "failed" && !isFailed(r)) return false;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      return (
        r.attendee.toLowerCase().includes(q) ||
        r.session.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  function selectAllPending() {
    const pendingIds = records.filter(isPending).map((r) => r.id);
    setSelected(new Set(pendingIds));
  }

  async function handleBulkAction(action: "bulk_pass" | "bulk_fail") {
    if (selected.size === 0 || !reviewedBy.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/training-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: Array.from(selected),
          reviewedBy: reviewedBy.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSelected(new Set());
      setRefreshKey((k) => k + 1);
    } catch {
      // silently handle
    }
    setSubmitting(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: records.length },
    { key: "pending", label: "Pending", count: pendingCount },
    { key: "passed", label: "Passed", count: passCount },
    { key: "failed", label: "Failed", count: failCount },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Training Records</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-amber-500" /> {pendingCount} pending</span>
              {" "}&middot;{" "}
              <span className="inline-flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> {passCount} passed</span>
              {" "}&middot;{" "}
              <span className="inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" /> {failCount} failed</span>
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.key ? "text-slate-300" : "text-slate-400"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search attendee or session..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>

        {/* Select All Pending */}
        <button
          onClick={selectAllPending}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
        >
          Select All Pending
        </button>

        <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-blue-900">
            {selected.size} record{selected.size !== 1 ? "s" : ""} selected
          </span>

          <div className="h-6 w-px bg-blue-200 mx-1" />

          <div className="relative">
            <input
              type="text"
              placeholder="Reviewed by (required)"
              value={reviewedBy}
              onChange={(e) => setReviewedBy(e.target.value)}
              className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 bg-white"
            />
          </div>

          <button
            onClick={() => handleBulkAction("bulk_pass")}
            disabled={submitting || !reviewedBy.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Mark Pass
          </button>

          <button
            onClick={() => handleBulkAction("bulk_fail")}
            disabled={submitting || !reviewedBy.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Mark Fail
          </button>

          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-striped">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 w-10">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                    {selected.size === filtered.length && filtered.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3">Arrival Time</th>
                <th className="px-5 py-3">Session</th>
                <th className="px-5 py-3">Attendee</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Pass/Fail</th>
                <th className="px-5 py-3">Reviewed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => {
                const isSelected = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-blue-50/30 cursor-pointer ${isSelected ? "bg-blue-50/50" : ""}`}
                    onClick={() => toggleRow(r.id)}
                  >
                    <td className="px-5 py-3">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300" />
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600">{r.arrivalTime || "\u2014"}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{r.session || "\u2014"}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">{r.attendee || "\u2014"}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{r.date || "\u2014"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(r)}`}>
                        {isPassed(r) && <CheckCircle className="h-3 w-3" />}
                        {isFailed(r) && <XCircle className="h-3 w-3" />}
                        {isPending(r) && <Clock className="h-3 w-3" />}
                        {statusLabel(r)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500">{r.reviewedBy || "\u2014"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-slate-400">No records match your filters.</div>
        )}
      </div>
    </div>
  );
}
