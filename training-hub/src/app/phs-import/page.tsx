"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  FileUp,
  Check,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface ParsedRow {
  name: string;
  skill: string;
  date: string;
  matchedEmployee: string | null;
  matchedTraining: string | null;
  status: "matched" | "no_employee" | "no_training" | "no_date";
}

interface ImportResult {
  rows: ParsedRow[];
  headers: string[];
  trainingColumns: Array<{ header: string; trainingKey: string }>;
  summary: {
    total: number;
    matched: number;
    noEmployee: number;
    noTraining: number;
    noDate: number;
  };
  error?: string;
}

const STATUS_COLORS: Record<string, string> = {
  matched: "bg-emerald-100 text-emerald-800",
  no_employee: "bg-amber-100 text-amber-800",
  no_training: "bg-red-100 text-red-800",
  no_date: "bg-slate-100 text-slate-600",
};
const STATUS_LABELS: Record<string, string> = {
  matched: "Ready",
  no_employee: "No Employee Match",
  no_training: "Unknown Training",
  no_date: "No Date",
};

export default function PHSImportPage() {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [applyResult, setApplyResult] = useState<{ matched: number; errors: string[] } | null>(null);
  const [filter, setFilter] = useState<string>("all");

  // Name matching state
  const [matchingName, setMatchingName] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [employees, setEmployees] = useState<string[]>([]);
  const [savingMatch, setSavingMatch] = useState(false);

  const loadEmployees = useCallback(async () => {
    if (employees.length > 0) return;
    try {
      const res = await fetch("/api/employees");
      const data = await res.json();
      setEmployees((data.employees || []).map((e: { name: string }) => e.name).sort());
    } catch {}
  }, [employees.length]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setUploading(true);
    setUploadError("");

    try {
      const res = await fetch("/api/phs-import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        setUploadError(data.error || "Upload failed");
      } else {
        setResult(data);
        setStep("preview");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(false);
  }

  async function handleApply() {
    if (!result) return;
    const matchedRows = result.rows.filter((r) => r.status === "matched" && r.matchedEmployee && r.matchedTraining && r.date);
    if (matchedRows.length === 0) return;

    setApplying(true);
    setApplyError("");

    try {
      const fixes = matchedRows.map((r) => ({
        employee: r.matchedEmployee!,
        training: r.matchedTraining!,
        date: r.date,
      }));
      const res = await fetch("/api/phs-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApplyError(data.error || "Import failed");
      } else {
        setApplyResult({ matched: data.matched, errors: data.errors || [] });
        setStep("done");
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Import failed");
    }
    setApplying(false);
  }

  async function handleMapName(phsName: string, trainingName: string) {
    setSavingMatch(true);
    try {
      await fetch("/api/name-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", paylocityName: phsName, trainingName }),
      });
      // Re-upload to refresh matches
      setMatchingName(null);
      setMatchSearch("");
    } catch {}
    setSavingMatch(false);
  }

  function reset() {
    setStep("upload");
    setResult(null);
    setApplyResult(null);
    setUploadError("");
    setApplyError("");
    setFilter("all");
  }

  const filtered = result?.rows
    ? filter === "all"
      ? result.rows
      : result.rows.filter((r) => r.status === filter)
    : [];

  const matchedCount = result?.rows.filter((r) => r.status === "matched").length || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">PHS Import</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload PHS CSV or Excel exports to sync training dates into the Training sheet
          </p>
        </div>
        {step !== "upload" && (
          <button onClick={reset} className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Start Over
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-xs font-medium">
        <span className={`px-3 py-1 rounded-full ${step === "upload" ? "bg-blue-600 text-white" : "bg-emerald-100 text-emerald-700"}`}>
          1. Upload
        </span>
        <span className="text-slate-300">&rarr;</span>
        <span className={`px-3 py-1 rounded-full ${step === "preview" ? "bg-blue-600 text-white" : step === "done" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
          2. Preview &amp; Map
        </span>
        <span className="text-slate-300">&rarr;</span>
        <span className={`px-3 py-1 rounded-full ${step === "done" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
          3. Import
        </span>
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <form onSubmit={handleUpload} className="space-y-6">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center hover:border-blue-300 transition-colors">
              <FileUp className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <label className="cursor-pointer">
                <span className="text-sm font-medium text-blue-600 hover:text-blue-700">Choose a file</span>
                <span className="text-sm text-slate-500"> or drag and drop</span>
                <input type="file" name="file" accept=".csv,.xlsx,.xls" className="hidden" required />
              </label>
              <p className="text-xs text-slate-400 mt-2">CSV or Excel (.xlsx) files supported</p>
            </div>
            {uploadError && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {uploadError}
              </div>
            )}
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Parsing..." : "Upload & Parse"}
            </button>
          </form>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-2xl font-bold text-slate-900">{result.summary.total}</p>
              <p className="text-xs text-slate-500">Total Records</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-2xl font-bold text-emerald-600">{result.summary.matched}</p>
              <p className="text-xs text-slate-500">Ready to Import</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-2xl font-bold text-amber-600">{result.summary.noEmployee}</p>
              <p className="text-xs text-slate-500">No Employee Match</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-2xl font-bold text-red-600">{result.summary.noTraining}</p>
              <p className="text-xs text-slate-500">Unknown Training</p>
            </div>
          </div>

          {/* Data table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Parsed Records</h2>
              <div className="flex items-center gap-2">
                {matchedCount > 0 && (
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Import {matchedCount} Matched Records
                  </button>
                )}
              </div>
            </div>

            {applyError && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">{applyError}</div>
            )}

            {/* Filter tabs */}
            <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                All ({result.rows.length})
              </button>
              <button
                onClick={() => setFilter("matched")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${filter === "matched" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Ready ({result.summary.matched})
              </button>
              <button
                onClick={() => setFilter("no_employee")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${filter === "no_employee" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                No Employee ({result.summary.noEmployee})
              </button>
              <button
                onClick={() => setFilter("no_training")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${filter === "no_training" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Unknown Training ({result.summary.noTraining})
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">No records in this category.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="px-5 py-3">PHS Name</th>
                      <th className="px-5 py-3">Skill</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Matched Employee</th>
                      <th className="px-5 py-3">Training Column</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.slice(0, 200).map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-5 py-3 text-slate-900">{row.name}</td>
                        <td className="px-5 py-3 text-slate-600">{row.skill}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.date || "—"}</td>
                        <td className="px-5 py-3">
                          {row.matchedEmployee ? (
                            <span className="text-emerald-700 font-medium">{row.matchedEmployee}</span>
                          ) : row.status === "no_employee" ? (
                            matchingName === row.name ? (
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={matchSearch}
                                    onChange={(e) => setMatchSearch(e.target.value)}
                                    onFocus={() => loadEmployees()}
                                    placeholder="Search employee..."
                                    className="w-44 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                  />
                                  {matchSearch && employees.length > 0 && (
                                    <div className="absolute z-10 top-full left-0 w-56 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                      {employees
                                        .filter((e) => e.toLowerCase().includes(matchSearch.toLowerCase()))
                                        .slice(0, 15)
                                        .map((emp) => (
                                          <button
                                            key={emp}
                                            onClick={() => handleMapName(row.name, emp)}
                                            disabled={savingMatch}
                                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-slate-700"
                                          >
                                            {emp}
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </div>
                                <button onClick={() => { setMatchingName(null); setMatchSearch(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setMatchingName(row.name)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                              >
                                Match
                              </button>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.matchedTraining || "—"}</td>
                        <td className="px-5 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[row.status]}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <div className="px-6 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
                    Showing first 200 of {filtered.length} records
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Done Step */}
      {step === "done" && applyResult && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Import Complete</h2>
          <p className="text-sm text-slate-600 mb-4">
            Successfully imported <span className="font-semibold text-emerald-700">{applyResult.matched}</span> training record(s) into the Training sheet.
          </p>
          {applyResult.errors.length > 0 && (
            <div className="mt-4 mx-auto max-w-lg text-left bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-medium text-amber-800 mb-2">{applyResult.errors.length} error(s):</p>
              <ul className="text-xs text-amber-700 space-y-1">
                {applyResult.errors.slice(0, 10).map((err, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <XCircle className="h-3 w-3 shrink-0 mt-0.5" /> {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={reset} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Upload className="h-4 w-4" /> Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
