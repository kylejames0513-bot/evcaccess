"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Save, Plus, Trash2, Clock, Briefcase } from "lucide-react";
import { formatDivision } from "@/lib/format-utils";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Expiration windows and position-specific rules</p>
      </div>

      {/* Expiration Thresholds */}
      <ThresholdSection />

      {/* Position-Specific Requirements */}
      <PositionRulesSection />
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

  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<number>>(new Set());
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [newDept, setNewDept] = useState("");

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

  useEffect(() => {
    // Defer through a microtask so setState inside load() doesn't run
    // synchronously during the effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(load);
  }, []);

  useEffect(() => {
    if (!newDept) {
      // Clear asynchronously so we don't setState inside the effect body.
      // React 19's react-hooks/set-state-in-effect rule flags synchronous
      // setState calls because they cascade renders.
      void Promise.resolve().then(() => {
        setPositions([]);
        setSelectedPositions(new Set());
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/positions?department=${encodeURIComponent(newDept)}`
        );
        const d = await res.json();
        if (!cancelled) setPositions(d.positions ?? []);
      } catch {
        if (!cancelled) setPositions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newDept]);

  function togglePosition(pos: string) {
    const next = new Set(selectedPositions);
    if (next.has(pos)) next.delete(pos);
    else next.add(pos);
    setSelectedPositions(next);
  }

  function toggleTraining(id: number) {
    const next = new Set(selectedTrainingIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTrainingIds(next);
  }

  // IDs already required for ALL currently selected positions
  const alreadyRequired = new Set(
    positionRules
      .filter((r) =>
        r.department?.toLowerCase() === newDept.toLowerCase() &&
        r.position != null &&
        selectedPositions.has(r.position)
      )
      .map((r) => r.training_type_id)
  );

  async function handleAdd() {
    if (selectedTrainingIds.size === 0 || !newDept || selectedPositions.size === 0) return;
    setSaving(true);
    try {
      let failed = false;
      for (const pos of selectedPositions) {
        for (const ttId of selectedTrainingIds) {
          const res = await fetch("/api/required-trainings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              training_type_id: ttId,
              is_required: true,
              is_universal: false,
              department: newDept,
              position: pos,
            }),
          });
          if (!res.ok) failed = true;
        }
      }
      if (failed) alert("Some rules could not be saved (may already exist)");
      setAdding(false);
      setSelectedTrainingIds(new Set());
      setSelectedPositions(new Set());
      setNewDept("");
      await load();
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
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Department</label>
                <select
                  value={newDept}
                  onChange={(e) => { setNewDept(e.target.value); setSelectedPositions(new Set()); setSelectedTrainingIds(new Set()); }}
                  className="w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {divisions.map((d) => (
                    <option key={d} value={d}>{formatDivision(d)}</option>
                  ))}
                </select>
              </div>

              {/* Position checkboxes */}
              {newDept && positions.length > 0 && (
                <div className="mt-3">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Positions
                    <span className="text-slate-400 font-normal ml-1">({selectedPositions.size} selected)</span>
                  </label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto bg-white">
                    {positions.map((pos) => {
                      const checked = selectedPositions.has(pos);
                      return (
                        <label key={pos} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePosition(pos)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={checked ? "text-slate-900 font-medium" : "text-slate-600"}>{pos}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Training checkboxes — shown once at least one position is selected */}
              {newDept && selectedPositions.size > 0 && (
                <div className="mt-3">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Required Trainings
                    <span className="text-slate-400 font-normal ml-1">({selectedTrainingIds.size} selected)</span>
                  </label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto bg-white">
                    {trainingTypes.map((tt) => {
                      const checked = selectedTrainingIds.has(tt.id);
                      const exists = alreadyRequired.has(tt.id);
                      return (
                        <label
                          key={tt.id}
                          className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-0 ${exists ? "opacity-40" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked || exists}
                            disabled={exists}
                            onChange={() => toggleTraining(tt.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={checked ? "text-slate-900 font-medium" : "text-slate-600"}>{tt.name}</span>
                          {exists && <span className="text-[10px] text-slate-400 ml-auto">already set</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleAdd}
                  disabled={saving || selectedTrainingIds.size === 0 || !newDept || selectedPositions.size === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save {selectedPositions.size > 0 && selectedTrainingIds.size > 0
                    ? `(${selectedPositions.size} position${selectedPositions.size !== 1 ? "s" : ""} × ${selectedTrainingIds.size} training${selectedTrainingIds.size !== 1 ? "s" : ""})`
                    : ""}
                </button>
                <button
                  onClick={() => { setAdding(false); setSelectedTrainingIds(new Set()); setSelectedPositions(new Set()); setNewDept(""); }}
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
