"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Save, Clock, Upload, FileSpreadsheet, UserMinus } from "lucide-react";
import {
  MAX_SEPARATION_ROWS,
  parseSeparationWorkbook as parseSeparationWorkbookRows,
  type SeparationSyncRow,
  type SeparationParseSummary,
} from "@/lib/separation-workbook";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">
          Compact controls for threshold tuning and workbook-to-hub syncing. Required and
          excused training rules live on the{" "}
          <a
            href="/required-trainings"
            className="text-blue-600 hover:underline"
          >
            Required Trainings
          </a>{" "}
          page.
        </p>
      </div>

      <SeparationSyncSection />
      <ThresholdSection />
    </div>
  );
}

function SeparationSyncSection() {
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SeparationParseSummary | null>(null);
  const [rows, setRows] = useState<SeparationSyncRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    synced: number;
    already_inactive: number;
    no_match: number;
    ambiguous: number;
    failed: number;
    queued?: boolean;
    pending_id?: string;
  } | null>(null);

  async function handleWorkbook(file: File) {
    setError(null);
    setLastResult(null);
    setSummary(null);
    setRows([]);
    setFilename(file.name);

    const lower = file.name.toLowerCase();
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xlsm"))) {
      setError("Upload an .xlsx or .xlsm separation workbook.");
      return;
    }

    setParsing(true);
    try {
      const parsed = await parseSeparationWorkbook(file);
      if (parsed.rows.length === 0) {
        setError("No valid separation rows found on FY sheets.");
        return;
      }
      if (parsed.rows.length > MAX_SEPARATION_ROWS) {
        setError(
          `Workbook produced ${parsed.rows.length.toLocaleString()} rows, exceeding the ${MAX_SEPARATION_ROWS.toLocaleString()} row safety limit.`
        );
        return;
      }
      setRows(parsed.rows);
      setSummary(parsed.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse workbook");
    } finally {
      setParsing(false);
    }
  }

  async function syncWorkbookRows() {
    if (rows.length === 0) return;
    setSyncing(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/settings/separation-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ separations: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Workbook sync failed");

      if (res.status === 202) {
        setLastResult({
          synced: 0,
          already_inactive: 0,
          no_match: 0,
          ambiguous: 0,
          failed: 0,
          queued: true,
          pending_id: data.pending_id,
        });
      } else {
        setLastResult({
          synced: data.summary?.synced ?? 0,
          already_inactive: data.summary?.already_inactive ?? 0,
          no_match: data.summary?.no_match ?? 0,
          ambiguous: data.summary?.ambiguous ?? 0,
          failed: data.summary?.failed ?? 0,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workbook sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Separation Workbook Upload</h2>
          <p className="text-xs text-slate-500">
            Upload FY Separation Summary, parse all FY tabs, and sync terminations to the hub in one step.
          </p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Separation workbook (.xlsx or .xlsm)
            </span>
            <input
              type="file"
              accept=".xlsx,.xlsm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleWorkbook(f);
              }}
              className="block text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-slate-200 file:text-sm file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-50"
            />
          </label>
          <button
            type="button"
            onClick={syncWorkbookRows}
            disabled={rows.length === 0 || parsing || syncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {syncing ? "Syncing..." : `Sync ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </button>
        </div>

        {(parsing || syncing) && (
          <div className="inline-flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            {parsing ? "Parsing workbook..." : "Sending separation batch to hub..."}
          </div>
        )}

        {filename && (
          <p className="text-xs text-slate-500">
            Loaded file: <span className="font-medium text-slate-700">{filename}</span>
          </p>
        )}

        {summary && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">Workbook parse summary</p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Metric label="FY sheets" value={String(summary.fySheets.length)} />
              <Metric label="Rows parsed" value={String(summary.totalRows)} />
              <Metric label="Rows skipped" value={String(summary.skippedRows)} />
              <Metric label="Cap" value={MAX_SEPARATION_ROWS.toLocaleString()} />
            </div>
            <p className="mt-2 text-xs text-slate-500 truncate" title={summary.fySheets.join(", ")}>
              Sheets: {summary.fySheets.join(", ")}
            </p>
          </div>
        )}

        {lastResult && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
              <UserMinus className="h-4 w-4" />
              {lastResult.queued ? "Workbook batch queued for approval" : "Workbook sync completed"}
            </div>
            {lastResult.queued ? (
              <p className="text-xs text-emerald-800 mt-1">
                Pending ID: <span className="font-mono">{lastResult.pending_id ?? "n/a"}</span>
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-emerald-900">
                <Metric label="Synced" value={String(lastResult.synced)} />
                <Metric label="Inactive" value={String(lastResult.already_inactive)} />
                <Metric label="No match" value={String(lastResult.no_match)} />
                <Metric label="Ambiguous" value={String(lastResult.ambiguous)} />
                <Metric label="Failed" value={String(lastResult.failed)} />
              </div>
            )}
          </div>
        )}

        {error && <div className="text-red-700 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

async function parseSeparationWorkbook(
  file: File
): Promise<{ rows: SeparationSyncRow[]; summary: SeparationParseSummary }> {
  const xlsx = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: "array", cellDates: true });
  return parseSeparationWorkbookRows(workbook);
}

// ────────────────────────────────────────────────────────────
// Expiration Threshold Section
// ────────────────────────────────────────────────────────────

function ThresholdSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState(90);
  const [warning, setWarning] = useState(60);
  const [critical, setCritical] = useState(30);

  useEffect(() => {
    fetch("/api/compliance")
      .then((r) => r.json())
      .then((d) => {
        if (d.thresholds) {
          setNotice(d.thresholds.notice);
          setWarning(d.thresholds.warning);
          setCritical(d.thresholds.critical);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice, warning, critical }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Clock className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Expiration Thresholds</h2>
          <p className="text-xs text-slate-500">Configure when trainings are flagged as expiring on the compliance dashboard</p>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" /></div>
      ) : (
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notice (days)</label>
              <input
                type="number"
                min={1}
                value={notice}
                onChange={(e) => setNotice(parseInt(e.target.value, 10) || 90)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-[10px] text-yellow-600 mt-0.5">Yellow zone</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Warning (days)</label>
              <input
                type="number"
                min={1}
                value={warning}
                onChange={(e) => setWarning(parseInt(e.target.value, 10) || 60)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-[10px] text-amber-600 mt-0.5">Amber zone</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Critical (days)</label>
              <input
                type="number"
                min={1}
                value={critical}
                onChange={(e) => setCritical(parseInt(e.target.value, 10) || 30)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-[10px] text-red-600 mt-0.5">Red zone</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Thresholds
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg p-3 text-sm font-medium">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
