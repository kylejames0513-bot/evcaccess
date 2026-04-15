"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";

type PendingRow = {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  payload: unknown;
};

export default function RosterQueuePage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/roster-queue?scope=${scope}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load queue");
      setRows((j.rows ?? []) as PendingRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setActing(id);
    setError(null);
    try {
      const r = await fetch(`/api/roster-queue/${id}/approve`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Approve failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  }

  async function deny(id: string) {
    const reason = window.prompt("Optional reason (stored on the event):", "") ?? "";
    setActing(id);
    setError(null);
    try {
      const r = await fetch(`/api/roster-queue/${id}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Deny failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deny failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-sm">
          <Inbox className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roster queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            When <code className="text-xs bg-slate-100 px-1 rounded">HUB_ROSTER_SYNC_GATED=true</code>, Excel sync batches land
            here until you approve them. Default mode applies sync immediately (Option A). See{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">docs/operations-roster-queue.md</code> in the repo.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setScope("pending")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            scope === "pending" ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-700"
          }`}
        >
          Pending
        </button>
        <button
          type="button"
          onClick={() => setScope("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            scope === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-700"
          }`}
        >
          Recent (all statuses)
        </button>
      </div>

      {loading && <Loading message="Loading roster queue…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-slate-600 border border-slate-200 rounded-xl bg-white p-4">
          No {scope === "pending" ? "pending" : ""} roster events. Gated mode is off unless{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">HUB_ROSTER_SYNC_GATED</code> is enabled on the server.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {rows.map((row) => (
            <li key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 capitalize">{row.kind.replace(/_/g, " ")}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{row.id}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(row.created_at).toLocaleString()} · {row.status}
                </p>
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={acting === row.id}
                    onClick={() => void approve(row.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {acting === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={acting === row.id}
                    onClick={() => void deny(row.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
