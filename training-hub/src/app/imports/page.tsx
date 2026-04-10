"use client";

import { useEffect, useState } from "react";

type Source = "paylocity" | "phs" | "access" | "signin";

interface ImportRow {
  id: string;
  source: string;
  filename: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_in: number | null;
  rows_added: number | null;
  rows_unresolved: number | null;
  rows_unknown: number | null;
}

interface PreviewSummary {
  rows_in: number;
  rows_added_estimate: number;
  rows_skipped_estimate: number;
  unresolved_count: number;
  unknown_count: number;
  rehired_count: number;
}

/**
 * /imports
 *
 * HR admin uploads a CSV (Paylocity, PHS, Access, or sign-in shape),
 * sees a preview of how the resolver classified the rows, and either
 * commits or discards. Imports run log is shown beneath.
 *
 * CSV parsing happens in the browser via the existing xlsx package.
 * The parsed rows are POSTed to /api/imports which runs the resolver
 * and stores a preview row.
 */
export default function ImportsPage() {
  const [source, setSource] = useState<Source>("paylocity");
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);

  useEffect(() => {
    void loadImports();
  }, []);

  async function loadImports() {
    try {
      const r = await fetch("/api/imports?limit=20");
      const j = await r.json();
      setImports(j.imports ?? []);
    } catch {
      // ignore
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setPreviewId(null);
    setPreviewSummary(null);
    setFilename(file.name);
    try {
      const xlsx = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
      });
      // Normalize for the signin source: the in-app form uses
      // attendeeName/trainingSession but legacy CSV exports may have
      // "Attendee Name" / "Training Session" headers.
      if (source === "signin") {
        for (const row of rows) {
          if (row["Attendee Name"] && !row.attendeeName) row.attendeeName = row["Attendee Name"];
          if (row["Training Session"] && !row.trainingSession) row.trainingSession = row["Training Session"];
          if (row["Date of Training"] && !row.dateOfTraining) row.dateOfTraining = row["Date of Training"];
        }
      }
      setParsedRows(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }

  async function preview() {
    setPreviewing(true);
    setError(null);
    try {
      const r = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, filename, rows: parsedRows }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j.error || "Preview failed");
      }
      setPreviewId(j.import_id);
      setPreviewSummary(j.summary);
      void loadImports();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function commit() {
    if (!previewId) return;
    setCommitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/imports/${previewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit" }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j.error || "Commit failed");
      }
      setPreviewId(null);
      setPreviewSummary(null);
      setParsedRows([]);
      setFilename("");
      void loadImports();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Imports</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload a Paylocity, PHS, Access, or sign-in CSV. Preview the result, then commit.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="block w-48 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="paylocity">Paylocity</option>
              <option value="phs">PHS</option>
              <option value="access">Access</option>
              <option value="signin">Sign in</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">CSV or XLSX file</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="block text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-slate-200 file:text-sm file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-50"
            />
          </label>
          <button
            type="button"
            onClick={preview}
            disabled={parsedRows.length === 0 || previewing}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {previewing ? "Resolving..." : `Preview ${parsedRows.length} rows`}
          </button>
        </div>

        {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm mb-2">{error}</div>}

        {previewSummary && (
          <div className="border-t border-slate-100 pt-5 mt-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Preview</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-5">
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Rows in</dt>
                <dd className="text-slate-900 font-medium mt-0.5">{previewSummary.rows_in}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Will add</dt>
                <dd className="text-emerald-700 font-semibold mt-0.5">{previewSummary.rows_added_estimate}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Skipped (non-training)</dt>
                <dd className="text-slate-900 font-medium mt-0.5">{previewSummary.rows_skipped_estimate}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unresolved people</dt>
                <dd className="text-amber-700 font-medium mt-0.5">{previewSummary.unresolved_count}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unknown trainings</dt>
                <dd className="text-amber-700 font-medium mt-0.5">{previewSummary.unknown_count}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Rehired profiles</dt>
                <dd className="text-slate-900 font-medium mt-0.5">{previewSummary.rehired_count}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={commit}
                disabled={committing}
                className="px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold hover:bg-emerald-100 disabled:opacity-50"
              >
                {committing ? "Committing..." : "Commit to database"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewId(null);
                  setPreviewSummary(null);
                }}
                className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Discard preview
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Recent imports</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Source</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Filename</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Status</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Rows in</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Added</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Unresolved</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Unknown</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-900">{row.source}</td>
                  <td className="px-3 py-2.5 text-slate-900">{row.filename ?? ""}</td>
                  <td className="px-3 py-2.5 text-slate-900">{row.status}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{row.rows_in ?? ""}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{row.rows_added ?? ""}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{row.rows_unresolved ?? ""}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">{row.rows_unknown ?? ""}</td>
                  <td className="px-3 py-2.5 text-slate-500">{new Date(row.started_at).toLocaleString()}</td>
                </tr>
              ))}
              {imports.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-slate-400 text-center" colSpan={8}>
                    No imports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
