"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, ShieldCheck } from "lucide-react";

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
type RuleKind = "required" | "excused";

interface NewRuleDraft {
  training_type_id: number | "";
  kind: RuleKind;
  scope: Scope;
  department: string;
  position: string;
  reason: string;
  notes: string;
}

const EMPTY_DRAFT: NewRuleDraft = {
  training_type_id: "",
  kind: "required",
  scope: "universal",
  department: "",
  position: "",
  reason: "",
  notes: "",
};

// Reason codes for excusals — keep in sync with the bulk-excuse helpers
// elsewhere. First entry is the general catch-all that HR picks most
// often when a whole division doesn't take a training (e.g. Finance
// excused from Ukeru).
const EXCUSAL_REASONS: { code: string; label: string }[] = [
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
      if (draft.kind === "excused") {
        // Excused path: create excusals for every active employee in
        // the target department (optionally narrowed to a position).
        // Universal-scope excusals don't make sense — you'd excuse
        // everyone from a training — so require at least a department.
        if (draft.scope === "universal") {
          throw new Error("Excusals require a department (or department + position)");
        }
        if (!draft.department.trim()) {
          throw new Error("Department is required to excuse");
        }
        if (draft.scope === "position" && !draft.position.trim()) {
          throw new Error("Position is required for this scope");
        }
        if (!draft.reason.trim()) {
          throw new Error("Pick an excusal reason");
        }
        const tt = trainingTypes.find((t) => t.id === draft.training_type_id);
        if (!tt) throw new Error("Unknown training type");

        const body: Record<string, unknown> = {
          division: draft.department.trim(),
          trainingColumnKeys: [tt.column_key],
          reason: draft.reason.trim(),
        };
        if (draft.scope === "position") {
          body.position = draft.position.trim();
        }
        const res = await fetch("/api/bulk-excuse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Excuse failed");
        setDraft(EMPTY_DRAFT);
        // Excusals live in the excusals table, not required_trainings,
        // so there's nothing new to show in the rules table. Re-load
        // anyway in case an HR user had a stale view open.
        await load();
        return;
      }

      // Required path — writes to required_trainings as before.
      const body: Record<string, unknown> = {
        training_type_id: draft.training_type_id,
        is_universal: draft.scope === "universal",
        is_required: true,
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
          These rules drive the compliance dashboard. Pick{" "}
          <span className="font-semibold">Required</span> to add a training
          a group must complete, or <span className="font-semibold">Excused</span>{" "}
          to waive it (e.g. Finance is excused from Ukeru). Scopes:{" "}
          universal (all employees), department (everyone in a division), and
          department + position (single role). More-specific rules override
          less-specific ones.
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

        {/* Required vs Excused — picking Excused auto-bumps scope off
            "universal" because excusing everyone would make no sense. */}
        <div className="flex gap-2 mb-4">
          {(["required", "excused"] as const).map((k) => {
            const active = draft.kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    kind: k,
                    scope: k === "excused" && d.scope === "universal" ? "department" : d.scope,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  active
                    ? k === "excused"
                      ? "bg-amber-50 border-amber-300 text-amber-700"
                      : "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {k === "required" ? "Required" : "Excused"}
              </button>
            );
          })}
        </div>

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
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
            >
              {/* Universal excused makes no sense — hide it when kind=excused */}
              {draft.kind !== "excused" && (
                <option value="universal">Universal</option>
              )}
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
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
              draft.kind === "excused"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : draft.kind === "excused" ? "Excuse" : "Add"}
          </button>
        </div>

        {/* Reason picker is only meaningful for excusals. */}
        {draft.kind === "excused" && (
          <label className="block mt-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
              Excusal reason
            </span>
            <select
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className="w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Pick a reason…</option>
              {EXCUSAL_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {draft.kind === "required" && (
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
        )}

        <p className="text-[11px] text-slate-400 mt-3">
          {draft.kind === "excused"
            ? "Excused writes an excusal row for every active employee in the selected scope. Run it again any time new hires land in that department — re-running is safe."
            : "Required writes to the required_trainings table. Use the rules table below to toggle Required/Waived or delete rules."}
        </p>
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
    </div>
  );
}
