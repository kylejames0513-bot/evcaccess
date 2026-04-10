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
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Imports</h1>
      <p className="text-gray-600 mb-6">
        Upload a Paylocity, PHS, Access, or sign-in CSV. Preview the result, then commit.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <label className="block">
            <span className="text-sm font-medium">Source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="mt-1 block w-48 rounded border-gray-300"
            >
              <option value="paylocity">Paylocity</option>
              <option value="phs">PHS</option>
              <option value="access">Access</option>
              <option value="signin">Sign in</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">CSV or XLSX file</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="mt-1 block"
            />
          </label>
          <button
            type="button"
            onClick={preview}
            disabled={parsedRows.length === 0 || previewing}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {previewing ? "Resolving..." : `Preview ${parsedRows.length} rows`}
          </button>
        </div>

        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}

        {previewSummary && (
          <div className="border-t pt-4 mt-4">
            <h2 className="font-semibold mb-2">Preview</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm mb-4">
              <div><dt className="text-gray-500">Rows in</dt><dd>{previewSummary.rows_in}</dd></div>
              <div><dt className="text-gray-500">Will add</dt><dd className="text-green-700 font-semibold">{previewSummary.rows_added_estimate}</dd></div>
              <div><dt className="text-gray-500">Skipped (non-training)</dt><dd>{previewSummary.rows_skipped_estimate}</dd></div>
              <div><dt className="text-gray-500">Unresolved people</dt><dd className="text-amber-700">{previewSummary.unresolved_count}</dd></div>
              <div><dt className="text-gray-500">Unknown trainings</dt><dd className="text-amber-700">{previewSummary.unknown_count}</dd></div>
              <div><dt className="text-gray-500">Rehired profiles</dt><dd>{previewSummary.rehired_count}</dd></div>
            </dl>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={commit}
                disabled={committing}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                {committing ? "Committing..." : "Commit to database"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewId(null);
                  setPreviewSummary(null);
                }}
                className="px-4 py-2 bg-gray-200 rounded"
              >
                Discard preview
              </button>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-xl font-bold mb-2">Recent imports</h2>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Filename</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Rows in</th>
              <th className="px-3 py-2 text-right">Added</th>
              <th className="px-3 py-2 text-right">Unresolved</th>
              <th className="px-3 py-2 text-right">Unknown</th>
              <th className="px-3 py-2 text-left">Started</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.source}</td>
                <td className="px-3 py-2">{row.filename ?? ""}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 text-right">{row.rows_in ?? ""}</td>
                <td className="px-3 py-2 text-right">{row.rows_added ?? ""}</td>
                <td className="px-3 py-2 text-right">{row.rows_unresolved ?? ""}</td>
                <td className="px-3 py-2 text-right">{row.rows_unknown ?? ""}</td>
                <td className="px-3 py-2">{new Date(row.started_at).toLocaleString()}</td>
              </tr>
            ))}
            {imports.length === 0 && (
              <tr>
                <td className="px-3 py-2 text-gray-500" colSpan={8}>
                  No imports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
