"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Save, Building2, Plus, Trash2, X, ShieldCheck, Users, Clock, Briefcase } from "lucide-react";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { formatDivision } from "@/lib/format-utils";

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
  tracked: string[];
  required: string[];
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Department training rules control all compliance tracking</p>
      </div>

      {/* Expiration Thresholds */}
      <ThresholdSection />

      {/* Department Training Rules */}
      <DeptRulesSection />

      {/* Position-Specific Requirements */}
      <PositionRulesSection />

      {/* Bulk Excuse */}
      <BulkExcuseSection />
    </div>
  );
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
                onChange={(e) => setNotice(parseInt(e.target.value) || 90)}
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
                onChange={(e) => setWarning(parseInt(e.target.value) || 60)}
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
                onChange={(e) => setCritical(parseInt(e.target.value) || 30)}
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

// ────────────────────────────────────────────────────────────
// Position-Specific Requirements Section
// ────────────────────────────────────────────────────────────

interface PositionRule {
  id: number;
  training_type_id: number;
  department: string | null;
  position: string | null;
  is_required: boolean;
  is_universal: boolean;
}

interface TrainingTypeOption {
  id: number;
  name: string;
}

function PositionRulesSection() {
  const [allRules, setAllRules] = useState<PositionRule[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingTypeOption[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [newTrainingTypeId, setNewTrainingTypeId] = useState<number | "">("");
  const [newDept, setNewDept] = useState("");
  const [newPosition, setNewPosition] = useState("");

  // Only show position-scoped rules (not universal/dept — those are in the dept rules section)
  const positionRules = allRules.filter((r) => r.position != null);

  async function load() {
    try {
      const [rulesRes, divRes, ttRes] = await Promise.all([
        fetch("/api/required-trainings").then((r) => r.json()),
        fetch("/api/divisions").then((r) => r.json()),
        fetch("/api/training-types").then((r) => r.json()),
      ]);
      setAllRules(rulesRes.required_trainings ?? []);
      setDivisions(divRes.divisions ?? []);
      setTrainingTypes(
        (ttRes.training_types ?? [])
          .filter((t: TrainingTypeOption & { is_active?: boolean }) => t.is_active !== false)
          .sort((a: TrainingTypeOption, b: TrainingTypeOption) => a.name.localeCompare(b.name))
      );
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (newDept) {
      fetch(`/api/positions?department=${encodeURIComponent(newDept)}`)
        .then((r) => r.json())
        .then((d) => setPositions(d.positions ?? []))
        .catch(() => setPositions([]));
    } else {
      setPositions([]);
      setNewPosition("");
    }
  }, [newDept]);

  async function handleAdd() {
    if (!newTrainingTypeId || !newDept || !newPosition) return;
    setSaving(true);
    try {
      const res = await fetch("/api/required-trainings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          training_type_id: newTrainingTypeId,
          is_required: true,
          is_universal: false,
          department: newDept,
          position: newPosition,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to add rule");
      } else {
        setAdding(false);
        setNewTrainingTypeId("");
        setNewDept("");
        setNewPosition("");
        await load();
      }
    } catch {}
    setSaving(false);
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/required-trainings/${id}`, { method: "DELETE" });
      await load();
    } catch {}
    setDeleting(null);
  }

  function trainingName(id: number): string {
    return trainingTypes.find((t) => t.id === id)?.name ?? `Training ${id}`;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Briefcase className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Position Requirements</h2>
            <p className="text-xs text-slate-500">Require specific certifications for positions within a department</p>
          </div>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-6 py-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" /></div>
      ) : (
        <>
          {adding && (
            <div className="px-6 py-4 border-b border-slate-200 bg-blue-50/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Department</label>
                  <select
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {divisions.map((d) => (
                      <option key={d} value={d}>{formatDivision(d)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Position</label>
                  <select
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
                    disabled={!newDept}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">{newDept ? "Select..." : "Choose department first"}</option>
                    {positions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Training</label>
                  <select
                    value={newTrainingTypeId}
                    onChange={(e) => setNewTrainingTypeId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {trainingTypes.map((tt) => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleAdd}
                  disabled={saving || !newTrainingTypeId || !newDept || !newPosition}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
                <button
                  onClick={() => { setAdding(false); setNewTrainingTypeId(""); setNewDept(""); setNewPosition(""); }}
                  className="px-4 py-2 text-sm font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {positionRules.length === 0 && !adding ? (
            <div className="px-6 py-8 text-center text-sm text-slate-400">
              No position-specific rules yet. Click Add to require a training for a specific position.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {positionRules.map((rule) => (
                <div key={rule.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 group">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{trainingName(rule.training_type_id)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDivision(rule.department ?? "")} &mdash; {rule.position}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    disabled={deleting === rule.id}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove rule"
                  >
                    {deleting === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500">
          Position rules add requirements on top of department rules. e.g. &quot;Case Managers in Behavioral Health need Med Recert&quot;
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Department Training Rules Section
// ────────────────────────────────────────────────────────────

function DeptRulesSection() {
  const [rules, setRules] = useState<DeptRule[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDept, setNewDept] = useState("");
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editTracked, setEditTracked] = useState<Set<string>>(new Set());
  const [editRequired, setEditRequired] = useState<Set<string>>(new Set());

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

  async function handleSaveRule(department: string, tracked: string[], required: string[]) {
    setSaving(department);
    try {
      const res = await fetch("/api/dept-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, tracked, required }),
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
    setEditTracked(new Set(rule.tracked));
    setEditRequired(new Set(rule.required));
  }

  function startAdd() {
    setAdding(true);
    setEditTracked(new Set(ALL_TRAININGS.map((t) => t.columnKey)));
    setEditRequired(new Set(ALL_TRAININGS.map((t) => t.columnKey)));
  }

  function cancelEdit() {
    setEditingDept(null);
    setAdding(false);
    setNewDept("");
  }

  function toggleTracked(key: string) {
    const next = new Set(editTracked);
    if (next.has(key)) {
      next.delete(key);
      // Also remove from required if untracking
      const nextReq = new Set(editRequired);
      nextReq.delete(key);
      setEditRequired(nextReq);
    } else {
      next.add(key);
    }
    setEditTracked(next);
  }

  function toggleRequired(key: string) {
    // Can only require if tracked
    if (!editTracked.has(key)) return;
    const next = new Set(editRequired);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEditRequired(next);
  }

  function trackAll() {
    setEditTracked(new Set(ALL_TRAININGS.map((t) => t.columnKey)));
  }

  function trackNone() {
    setEditTracked(new Set());
    setEditRequired(new Set());
  }

  function requireAllTracked() {
    setEditRequired(new Set(editTracked));
  }

  function requireNone() {
    setEditRequired(new Set());
  }

  function saveEdit() {
    const dept = adding ? newDept.trim() : editingDept;
    if (!dept) return;
    handleSaveRule(dept, Array.from(editTracked), Array.from(editRequired));
  }

  const isEditing = editingDept !== null || adding;

  // Inline editor table for tracked/required checkboxes
  function renderTrainingTable() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trainings</label>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={editTracked.size === ALL_TRAININGS.length ? trackNone : trackAll}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {editTracked.size === ALL_TRAININGS.length ? "Track None" : "Track All"}
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={editRequired.size === editTracked.size && editTracked.size > 0 ? requireNone : requireAllTracked}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {editRequired.size === editTracked.size && editTracked.size > 0 ? "Require None" : "Require All Tracked"}
            </button>
          </div>
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Training</th>
                <th className="text-center px-3 py-2 font-semibold text-slate-500 w-20">Tracked</th>
                <th className="text-center px-3 py-2 font-semibold text-slate-500 w-20">Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ALL_TRAININGS.map(({ columnKey, name }) => {
                const isTracked = editTracked.has(columnKey);
                const isRequired = editRequired.has(columnKey);
                return (
                  <tr key={columnKey} className={isTracked ? "bg-blue-50/30" : ""}>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${isTracked ? "text-slate-900" : "text-slate-400"}`}>{name}</span>
                    </td>
                    <td className="text-center px-3 py-2">
                      <button
                        onClick={() => toggleTracked(columnKey)}
                        className="inline-flex items-center justify-center"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          isTracked ? "bg-blue-600 border-blue-600" : "border-slate-300"
                        }`}>
                          {isTracked && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                    </td>
                    <td className="text-center px-3 py-2">
                      <button
                        onClick={() => toggleRequired(columnKey)}
                        disabled={!isTracked}
                        className="inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          isRequired ? "bg-amber-600 border-amber-600" : "border-slate-300"
                        }`}>
                          {isRequired && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Tracked = division has this training (unchecked = NA auto-fill). Required = actively monitored for compliance.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Department Training Rules</h2>
            <p className="text-xs text-slate-500">Set which trainings each department tracks and requires. Employees without a rule get all tracked trainings.</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all"
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
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Division</label>
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
                      <option key={d} value={d}>{formatDivision(d)}</option>
                    ))}
                </select>
              </div>
              {renderTrainingTable()}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={saveEdit}
                  disabled={!newDept.trim() || saving !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Rule
                </button>
                <button onClick={cancelEdit} className="px-4 py-2 text-sm font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500">
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

                if (isEditingThis) {
                  return (
                    <div key={rule.department} className="px-6 py-4 bg-blue-50/30">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-900">{formatDivision(rule.department)}</h3>
                        <button onClick={cancelEdit} className="p-1 hover:bg-slate-200 rounded">
                          <X className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                      {renderTrainingTable()}
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={saveEdit}
                          disabled={saving !== null}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                        >
                          {saving === rule.department ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                        <button onClick={cancelEdit} className="px-4 py-2 text-sm font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500">
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                const requiredNames = rule.required
                  .map((key) => ALL_TRAININGS.find((t) => t.columnKey === key)?.name || key)
                  .sort()
                  .join(", ");

                return (
                  <div key={rule.department} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 group">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{formatDivision(rule.department)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rule.tracked.length === 0 ? (
                          <span className="text-red-600 font-medium">All excused (NA)</span>
                        ) : (
                          <>
                            <span className="text-slate-500 font-medium">{rule.tracked.length} tracked</span>
                            {", "}
                            <span className="text-amber-600 font-medium">{rule.required.length} required</span>
                            {rule.required.length > 0 && (
                              <span className="text-slate-400"> — {requiredNames}</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(rule)}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500 transition-colors"
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
          Employees in departments without a rule will be tracked against all trainings.
        </p>
      </div>
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
