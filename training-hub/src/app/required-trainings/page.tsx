"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, ShieldCheck, Loader2, Check, Users } from "lucide-react";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { formatDivision } from "@/lib/format-utils";

// Unique column keys with display names -- used by BulkExcuseSection
const ALL_TRAININGS = (() => {
  const seen = new Set<string>();
  const result: { columnKey: string; name: string }[] = [];
  for (const def of TRAINING_DEFINITIONS) {
    if (!seen.has(def.columnKey)) {
      seen.add(def.columnKey);
      result.push({ columnKey: def.columnKey, name: def.name });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
})();

interface RequiredTraining {
  id: number;
  training_type_id: number;
  department: string | null;
  position: string | null;
  is_universal: boolean;
  is_required: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TrainingTypeOption {
  id: number;
  name: string;
  column_key: string;
  is_active: boolean;
}

type Scope = "universal" | "department" | "position";

interface NewRuleDraft {
  training_type_id: number | "";
  scope: Scope;
  department: string;
  position: string;
  is_required: boolean;
  notes: string;
}

const EMPTY_DRAFT: NewRuleDraft = {
  training_type_id: "",
  scope: "universal",
  department: "",
  position: "",
  is_required: true,
  notes: "",
};

/**
 * /required-trainings
 *
 * Admin UI for the required_trainings table. HR can add / remove / edit
 * the rules that drive the compliance dashboard without editing source
 * code. Supports three scopes: universal, department, department+position.
 * Position-scoped rules override department rules, which override universal.
 */
export default function RequiredTrainingsPage() {
  const [rules, setRules] = useState<RequiredTraining[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewRuleDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Scope>("universal");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRules, rTypes] = await Promise.all([
        fetch("/api/required-trainings").then((r) => r.json()),
        fetch("/api/training-types").then((r) => r.json()),
      ]);
      if (rRules.error) throw new Error(rRules.error);
      if (rTypes.error) throw new Error(rTypes.error);
      setRules(rRules.required_trainings ?? []);
      setTrainingTypes(
        (rTypes.training_types ?? [])
          .filter((t: TrainingTypeOption) => t.is_active !== false)
          .sort((a: TrainingTypeOption, b: TrainingTypeOption) =>
            a.name.localeCompare(b.name)
          )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ttById = useMemo(() => {
    const m = new Map<number, TrainingTypeOption>();
    for (const t of trainingTypes) m.set(t.id, t);
    return m;
  }, [trainingTypes]);

  const grouped = useMemo(() => {
    const out: Record<Scope, RequiredTraining[]> = {
      universal: [],
      department: [],
      position: [],
    };
    for (const r of rules) {
      if (r.is_universal) out.universal.push(r);
      else if (r.position) out.position.push(r);
      else if (r.department) out.department.push(r);
    }
    return out;
  }, [rules]);

  async function addRule() {
    if (!draft.training_type_id) {
      setError("Pick a training");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        training_type_id: draft.training_type_id,
        is_universal: draft.scope === "universal",
        is_required: draft.is_required,
        notes: draft.notes || null,
      };
      if (draft.scope === "department" || draft.scope === "position") {
        if (!draft.department.trim()) throw new Error("Department is required for this scope");
        body.department = draft.department.trim();
      }
      if (draft.scope === "position") {
        if (!draft.position.trim()) throw new Error("Position is required for this scope");
        body.position = draft.position.trim();
      }
      const res = await fetch("/api/required-trainings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRequired(rule: RequiredTraining) {
    setError(null);
    try {
      const res = await fetch(`/api/required-trainings/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_required: !rule.is_required }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteRule(rule: RequiredTraining) {
    if (!confirm(`Delete this rule? This cannot be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/required-trainings/${rule.id}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">Required Trainings</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          These rules drive the compliance dashboard. Three scopes:{" "}
          <span className="font-semibold">universal</span> (all employees),{" "}
          <span className="font-semibold">department</span> (everyone in a division),
          and <span className="font-semibold">department + position</span> (single role).
          More-specific rules override less-specific ones.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Add rule */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add rule
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
          <label className="sm:col-span-2 block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              Training
            </span>
            <select
              value={draft.training_type_id}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  training_type_id: e.target.value ? Number(e.target.value) : "",
                })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pick training…</option>
              {trainingTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              Scope
            </span>
            <select
              value={draft.scope}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value as Scope })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="universal">Universal</option>
              <option value="department">Department</option>
              <option value="position">Dept + position</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              Department
            </span>
            <input
              type="text"
              disabled={draft.scope === "universal"}
              value={draft.department}
              onChange={(e) => setDraft({ ...draft, department: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Residential"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              Position
            </span>
            <input
              type="text"
              disabled={draft.scope !== "position"}
              value={draft.position}
              onChange={(e) => setDraft({ ...draft, position: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. DSP"
            />
          </label>
          <button
            type="button"
            onClick={addRule}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
        <label className="block mt-3">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
            Notes (optional)
          </span>
          <input
            type="text"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Why does this rule exist?"
          />
        </label>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-0">
        {(["universal", "department", "position"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === s
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {s === "position" ? "Dept + position" : s} ({grouped[s].length})
          </button>
        ))}
      </div>

      {/* Rules table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3">Training</th>
              {tab !== "universal" && <th className="px-5 py-3">Department</th>}
              {tab === "position" && <th className="px-5 py-3">Position</th>}
              <th className="px-5 py-3">Required?</th>
              <th className="px-5 py-3">Notes</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grouped[tab].map((rule) => (
              <tr key={rule.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  {ttById.get(rule.training_type_id)?.name ??
                    `(unknown #${rule.training_type_id})`}
                </td>
                {tab !== "universal" && (
                  <td className="px-5 py-3 text-slate-700">{rule.department}</td>
                )}
                {tab === "position" && (
                  <td className="px-5 py-3 text-slate-700">{rule.position}</td>
                )}
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleRequired(rule)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      rule.is_required
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {rule.is_required ? "Required" : "Waived"}
                  </button>
                </td>
                <td className="px-5 py-3 text-slate-500 max-w-sm truncate">
                  {rule.notes}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => deleteRule(rule)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && grouped[tab].length === 0 && (
              <tr>
                <td
                  colSpan={tab === "position" ? 6 : tab === "department" ? 5 : 4}
                  className="px-5 py-8 text-center text-sm text-slate-400"
                >
                  No {tab} rules defined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Excuse — excuse a division or individual employees from one or
          more trainings in a single action. Moved here from /settings so all
          compliance-rule admin lives in one place. */}
      <BulkExcuseSection />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Bulk Excuse Section
// ────────────────────────────────────────────────────────────

const EXCUSAL_REASONS = [
  { code: "N/A", label: "N/A (General)" },
  { code: "Facilities", label: "Facilities" },
  { code: "MAINT", label: "Maintenance" },
  { code: "HR", label: "HR" },
  { code: "ADMIN", label: "Admin" },
  { code: "FINANCE", label: "Finance" },
  { code: "IT", label: "IT" },
  { code: "NURSE", label: "Nurse" },
  { code: "LPN", label: "LPN" },
  { code: "RN", label: "RN" },
  { code: "DIR", label: "Director" },
  { code: "MGR", label: "Manager" },
  { code: "SUPERVISOR", label: "Supervisor" },
  { code: "TRAINER", label: "Trainer" },
  { code: "BH", label: "Behavioral Health" },
  { code: "ELC", label: "ELC" },
  { code: "EI", label: "EI" },
];

function BulkExcuseSection() {
  const [divisions, setDivisions] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Array<{ name: string; position: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"division" | "individuals">("division");
  const [division, setDivision] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [empSearch, setEmpSearch] = useState("");
  const [selectedTrainings, setSelectedTrainings] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ excused: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/divisions").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ])
      .then(([divData, empData]) => {
        setDivisions(divData.divisions || []);
        setEmployees((empData.employees || []).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const trackedList = ALL_TRAININGS;

  function toggleTraining(key: string) {
    const next = new Set(selectedTrainings);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedTrainings(next);
    setResult(null);
  }

  function selectAllTrainings() {
    setSelectedTrainings(new Set(trackedList.map((t) => t.columnKey)));
    setResult(null);
  }

  function clearAllTrainings() {
    setSelectedTrainings(new Set());
    setResult(null);
  }

  function toggleEmployee(name: string) {
    const next = new Set(selectedEmployees);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelectedEmployees(next);
    setResult(null);
  }

  const filteredEmployees = empSearch
    ? employees.filter((e) => e.name.toLowerCase().includes(empSearch.toLowerCase()))
    : employees;

  async function handleExcuse() {
    const hasDivision = mode === "division" && division;
    const hasEmployees = mode === "individuals" && selectedEmployees.size > 0;
    if ((!hasDivision && !hasEmployees) || selectedTrainings.size === 0 || !reason) return;
    setSubmitting(true);
    setResult(null);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        trainingColumnKeys: Array.from(selectedTrainings),
        reason,
      };
      if (mode === "division") payload.division = division;
      else payload.employeeNames = Array.from(selectedEmployees);

      const res = await fetch("/api/bulk-excuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult({ excused: data.excused, skipped: data.skipped });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
    setSubmitting(false);
  }

  const allSelected = selectedTrainings.size === trackedList.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Bulk Excuse</h2>
          <p className="text-xs text-slate-500">Excuse a division or individual employees from trainings</p>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-12 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
        </div>
      ) : (
        <div className="px-6 py-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => { setMode("division"); setResult(null); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "division" ? "bg-white text-slate-900" : "text-slate-500"}`}
            >
              By Division
            </button>
            <button
              onClick={() => { setMode("individuals"); setResult(null); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "individuals" ? "bg-white text-slate-900" : "text-slate-500"}`}
            >
              Individual Employees
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mode === "division" ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Division</label>
                <select
                  value={division}
                  onChange={(e) => { setDivision(e.target.value); setResult(null); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select division...</option>
                  {divisions.map((d) => (
                    <option key={d} value={d}>{formatDivision(d)}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Employees ({selectedEmployees.size} selected)
                </label>
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white mb-2"
                />
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-1 space-y-0.5">
                  {filteredEmployees.slice(0, 100).map((emp) => {
                    const isSelected = selectedEmployees.has(emp.name);
                    return (
                      <button
                        key={emp.name}
                        onClick={() => toggleEmployee(emp.name)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                          isSelected ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50 text-slate-500"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"
                        }`}>
                          {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <span className="truncate">{emp.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reason</label>
              <select
                value={reason}
                onChange={(e) => { setReason(e.target.value); setResult(null); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select reason...</option>
                {EXCUSAL_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Training multi-select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Trainings ({selectedTrainings.size} selected)
              </label>
              <button
                onClick={allSelected ? clearAllTrainings : selectAllTrainings}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto p-1 border border-slate-200 rounded-lg">
              {trackedList.map(({ columnKey, name }) => {
                const isSelected = selectedTrainings.has(columnKey);
                return (
                  <button
                    key={columnKey}
                    onClick={() => toggleTraining(columnKey)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                      isSelected ? "bg-blue-50 text-blue-800" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"
                    }`}>
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span className="font-medium truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleExcuse}
              disabled={(mode === "division" ? !division : selectedEmployees.size === 0) || selectedTrainings.size === 0 || !reason || submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Excusing...</>
              ) : (
                <><ShieldCheck className="h-4 w-4" /> Excuse {selectedTrainings.size} Training{selectedTrainings.size !== 1 ? "s" : ""}{mode === "individuals" ? ` for ${selectedEmployees.size} Employee${selectedEmployees.size !== 1 ? "s" : ""}` : ""}</>
              )}
            </button>

            {result && (
              <span className="inline-flex items-center bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg p-3 text-sm font-medium">
                {result.excused} cell(s) excused
                {result.skipped > 0 && (
                  <>, <span className="text-slate-400">{result.skipped} skipped</span></>
                )}
              </span>
            )}

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          </div>
        </div>
      )}

      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500">
          Only empty cells are excused. Existing dates and excusals are never overwritten.
        </p>
      </div>
    </div>
  );
}
