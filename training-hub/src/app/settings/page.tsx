"use client";

import { useState, useEffect } from "react";
import { ClipboardCheck, Loader2, Check, Save, Building2, Plus, Trash2, X } from "lucide-react";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// Get unique column keys with display names
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

interface DeptRule {
  department: string;
  trainings: string[];
}

export default function SettingsPage() {
  const [tracks, setTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/compliance-tracks")
      .then((r) => r.json())
      .then((data) => {
        if (data.tracks) setTracks(new Set(data.tracks));
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    const next = new Set(tracks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTracks(next);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/compliance-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: Array.from(tracks) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">System configuration</p>
      </div>

      {/* Compliance Tracks */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Compliance Tracking</h2>
              <p className="text-xs text-slate-500">Choose which trainings appear on the Dashboard, Compliance, and Employee pages</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              saved
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-[#1e3a5f] text-white hover:bg-[#2a4d7a]"
            }`}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><Check className="h-4 w-4" /> Saved</>
            ) : (
              <><Save className="h-4 w-4" /> Save Changes</>
            )}
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ALL_TRAININGS.map(({ columnKey, name }) => {
              const isTracked = tracks.has(columnKey);
              const def = TRAINING_DEFINITIONS.find((d) => d.columnKey === columnKey);
              const renewalLabel = def && def.renewalYears > 0
                ? `${def.renewalYears}-year renewal`
                : "One-time";

              return (
                <button
                  key={columnKey}
                  onClick={() => toggle(columnKey)}
                  className={`w-full flex items-center justify-between px-6 py-3.5 text-left transition-colors ${
                    isTracked ? "bg-blue-50/50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isTracked ? "bg-[#1e3a5f] border-[#1e3a5f]" : "border-slate-300"
                    }`}>
                      {isTracked && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <div>
                      <span className={`text-sm font-medium ${isTracked ? "text-slate-900" : "text-slate-500"}`}>
                        {name}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">({columnKey})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{renewalLabel}</span>
                    {isTracked && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                        Tracked
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            {tracks.size} training{tracks.size !== 1 ? "s" : ""} tracked.
            Untracked trainings won&apos;t appear in compliance reports or employee detail views.
          </p>
        </div>
      </div>

      {/* Department Training Rules */}
      <DeptRulesSection trackedTrainings={tracks} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Department Training Rules Section
// ────────────────────────────────────────────────────────────

function DeptRulesSection({ trackedTrainings }: { trackedTrainings: Set<string> }) {
  const [rules, setRules] = useState<DeptRule[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDept, setNewDept] = useState("");
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editTrainings, setEditTrainings] = useState<Set<string>>(new Set());
  const [editAll, setEditAll] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/dept-rules").then((r) => r.json()),
      fetch("/api/divisions").then((r) => r.json()),
    ])
      .then(([rulesData, divData]) => {
        setRules(rulesData.rules || []);
        setDivisions(divData.divisions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Tracked trainings for checkboxes
  const trackedList = ALL_TRAININGS.filter((t) => trackedTrainings.has(t.columnKey));

  async function handleSaveRule(department: string, trainings: string[]) {
    setSaving(department);
    try {
      const res = await fetch("/api/dept-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, trainings }),
      });
      const d = await res.json();
      setRules(d.rules || []);
      setEditingDept(null);
      setAdding(false);
      setNewDept("");
    } catch {}
    setSaving(null);
  }

  async function handleRemove(department: string) {
    setSaving(department);
    try {
      const res = await fetch("/api/dept-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", department }),
      });
      const d = await res.json();
      setRules(d.rules || []);
    } catch {}
    setSaving(null);
  }

  function startEdit(rule: DeptRule) {
    setEditingDept(rule.department);
    const isAll = rule.trainings.includes("ALL");
    setEditAll(isAll);
    setEditTrainings(isAll ? new Set(trackedList.map((t) => t.columnKey)) : new Set(rule.trainings));
  }

  function startAdd() {
    setAdding(true);
    setEditAll(true);
    setEditTrainings(new Set(trackedList.map((t) => t.columnKey)));
  }

  function cancelEdit() {
    setEditingDept(null);
    setAdding(false);
    setNewDept("");
  }

  function toggleEditTraining(key: string) {
    const next = new Set(editTrainings);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEditTrainings(next);
    // If all are selected, set editAll
    setEditAll(next.size === trackedList.length);
  }

  function toggleAll() {
    if (editAll) {
      setEditTrainings(new Set());
      setEditAll(false);
    } else {
      setEditTrainings(new Set(trackedList.map((t) => t.columnKey)));
      setEditAll(true);
    }
  }

  function saveEdit() {
    const dept = adding ? newDept.trim() : editingDept;
    if (!dept) return;
    const trainings = editAll ? ["ALL"] : Array.from(editTrainings);
    handleSaveRule(dept, trainings);
  }

  const isEditing = editingDept !== null || adding;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Building2 className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Department Training Rules</h2>
            <p className="text-xs text-slate-500">Set which trainings each department requires. Employees without a rule get all tracked trainings.</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#1e3a5f] text-white hover:bg-[#2a4d7a] transition-all"
          >
            <Plus className="h-4 w-4" /> Add Rule
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-6 py-12 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
        </div>
      ) : (
        <>
          {/* Add new rule form */}
          {adding && (
            <div className="px-6 py-4 border-b border-slate-200 bg-blue-50/30">
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Division</label>
                <select
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                >
                  <option value="">Select a division...</option>
                  {divisions
                    .filter((d) => !rules.some((r) => r.department.toLowerCase() === d.toLowerCase()))
                    .map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                </select>
              </div>
              <TrainingCheckboxes
                trackedList={trackedList}
                selected={editTrainings}
                allSelected={editAll}
                onToggle={toggleEditTraining}
                onToggleAll={toggleAll}
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={saveEdit}
                  disabled={!newDept.trim() || editTrainings.size === 0 || saving !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#1e3a5f] text-white hover:bg-[#2a4d7a] disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Rule
                </button>
                <button onClick={cancelEdit} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Existing rules */}
          {rules.length === 0 && !adding ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No department rules configured. All employees get all tracked trainings.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rules.map((rule) => {
                const isEditingThis = editingDept === rule.department;
                const isAll = rule.trainings.includes("ALL");
                const displayTrainings = isAll
                  ? "All tracked trainings"
                  : rule.trainings
                      .map((key) => ALL_TRAININGS.find((t) => t.columnKey === key)?.name || key)
                      .join(", ");

                if (isEditingThis) {
                  return (
                    <div key={rule.department} className="px-6 py-4 bg-blue-50/30">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-900">{rule.department}</h3>
                        <button onClick={cancelEdit} className="p-1 hover:bg-slate-200 rounded">
                          <X className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                      <TrainingCheckboxes
                        trackedList={trackedList}
                        selected={editTrainings}
                        allSelected={editAll}
                        onToggle={toggleEditTraining}
                        onToggleAll={toggleAll}
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={saveEdit}
                          disabled={editTrainings.size === 0 || saving !== null}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#1e3a5f] text-white hover:bg-[#2a4d7a] disabled:opacity-50 transition-all"
                        >
                          {saving === rule.department ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                        <button onClick={cancelEdit} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={rule.department} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 group">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{rule.department}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isAll ? (
                          <span className="text-blue-600 font-medium">All tracked trainings</span>
                        ) : (
                          <>{rule.trainings.length} training{rule.trainings.length !== 1 ? "s" : ""}: {displayTrainings}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(rule)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemove(rule.department)}
                        disabled={saving === rule.department}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove rule"
                      >
                        {saving === rule.department ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500">
          {rules.length} rule{rules.length !== 1 ? "s" : ""} configured.
          Employees in departments without a rule will be tracked against all {trackedTrainings.size} tracked trainings.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Training checkboxes (reused in add/edit)
// ────────────────────────────────────────────────────────────

function TrainingCheckboxes({
  trackedList,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
}: {
  trackedList: { columnKey: string; name: string }[];
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">Required Trainings</label>
        <button
          onClick={onToggleAll}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-60 overflow-y-auto p-1">
        {trackedList.map(({ columnKey, name }) => {
          const isSelected = selected.has(columnKey);
          return (
            <button
              key={columnKey}
              onClick={() => onToggle(columnKey)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                isSelected ? "bg-blue-100 text-blue-800" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                isSelected ? "bg-[#1e3a5f] border-[#1e3a5f]" : "border-slate-300"
              }`}>
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="font-medium truncate">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
