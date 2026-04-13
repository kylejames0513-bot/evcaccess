"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, ShieldCheck, Loader2 } from "lucide-react";
import { formatDivision } from "@/lib/format-utils";

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

interface ExcusalRow {
  id: string;
  employee_id: string;
  training_type_id: number;
  reason: string;
  source: string;
  created_at: string;
  employee_first_name: string | null;
  employee_last_name: string | null;
  employee_department: string | null;
  employee_position: string | null;
  employee_is_active: boolean | null;
  training_name: string | null;
  training_column_key: string | null;
}

type Scope = "universal" | "department" | "position";
type RulesTab = Scope | "excusals";
type RuleKind = "required" | "excused";

interface NewRuleDraft {
  training_type_ids: Set<number>;
  kind: RuleKind;
  scope: Scope;
  // For department scope: multi-select. For position scope: restricted
  // to a single entry (because positions are dept-dependent).
  departments: Set<string>;
  positions: Set<string>;
  reason: string;
  notes: string;
}

function freshDraft(): NewRuleDraft {
  return {
    training_type_ids: new Set<number>(),
    kind: "required",
    scope: "universal",
    departments: new Set<string>(),
    positions: new Set<string>(),
    reason: "",
    notes: "",
  };
}

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
 *
 * The Add Rule form is mass-select: pick any number of trainings and any
 * number of departments (or one dept + any number of positions) and we
 * loop over the cartesian product on submit. Excused rules use the same
 * form and land in the excusals table via /api/bulk-excuse.
 */
export default function RequiredTrainingsPage() {
  const [rules, setRules] = useState<RequiredTraining[]>([]);
  const [excusals, setExcusals] = useState<ExcusalRow[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingTypeOption[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [positionsForDept, setPositionsForDept] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewRuleDraft>(freshDraft);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<RulesTab>("universal");
  const [deletingExcusalId, setDeletingExcusalId] = useState<string | null>(null);
  const [excusalFilter, setExcusalFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRules, rTypes, rDivs, rExcusals] = await Promise.all([
        fetch("/api/required-trainings").then((r) => r.json()),
        fetch("/api/training-types").then((r) => r.json()),
        fetch("/api/divisions").then((r) => r.json()),
        fetch("/api/excusal").then((r) => r.json()),
      ]);
      if (rRules.error) throw new Error(rRules.error);
      if (rTypes.error) throw new Error(rTypes.error);
      if (rDivs.error) throw new Error(rDivs.error);
      if (rExcusals.error) throw new Error(rExcusals.error);
      setRules(rRules.required_trainings ?? []);
      setTrainingTypes(
        (rTypes.training_types ?? [])
          .filter((t: TrainingTypeOption) => t.is_active !== false)
          .sort((a: TrainingTypeOption, b: TrainingTypeOption) =>
            a.name.localeCompare(b.name)
          )
      );
      setDivisions(rDivs.divisions ?? []);
      setExcusals(rExcusals.excusals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // When scope is "position", positions are dept-scoped, so we keep the
  // department selection to a single entry and reload the position list
  // whenever that department changes.
  const positionDept =
    draft.scope === "position" && draft.departments.size === 1
      ? Array.from(draft.departments)[0]
      : "";

  useEffect(() => {
    if (!positionDept) {
      void Promise.resolve().then(() => {
        setPositionsForDept([]);
      });
      return;
    }
    let cancelled = false;
    setLoadingPositions(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/positions?department=${encodeURIComponent(positionDept)}`
        );
        const d = await res.json();
        if (!cancelled) setPositionsForDept(d.positions ?? []);
      } catch {
        if (!cancelled) setPositionsForDept([]);
      } finally {
        if (!cancelled) setLoadingPositions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [positionDept]);

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

  // Training types that cannot be excused because a Required rule
  // already covers the scope being excused, OR because every employee
  // in the selected department already has an excusal for that
  // training. Used to grey out the corresponding checkboxes when
  // draft.kind === "excused".
  //
  //   - Universal required rules lock a training for ALL department
  //     excusals (e.g. CPR is required for everyone, so HR can't
  //     create a dept-level excusal for CPR at all).
  //   - Department-scoped required rules lock the training for
  //     excusals that target that same department.
  //   - If an excusal already exists for every selected department on
  //     that training, lock it too — re-running the bulk-excuse would
  //     be a no-op and clutters the form.
  //
  // Carries a per-id reason so the UI can show why each row is
  // disabled. Precedence: "required" reasons win over "already excused"
  // reasons since they're stronger statements.
  const lockedTrainingInfo = useMemo(() => {
    const info = new Map<number, string>();
    if (draft.kind !== "excused") return info;

    // Universal required rules always lock.
    for (const r of rules) {
      if (r.is_universal && r.is_required) {
        info.set(r.training_type_id, "Required universally — can't be excused");
      }
    }
    // Department-scoped required rules lock only if the excusal is
    // being created for that same department.
    if (draft.departments.size > 0) {
      const deptsLower = new Set(
        Array.from(draft.departments).map((d) => d.toLowerCase())
      );
      for (const r of rules) {
        if (!r.is_required || r.is_universal) continue;
        if (!r.department) continue;
        if (deptsLower.has(r.department.toLowerCase())) {
          if (!info.has(r.training_type_id)) {
            info.set(
              r.training_type_id,
              "Already required for the selected department"
            );
          }
        }
      }

      // Existing excusals for this (training, dept) pair → lock.
      // We consider a training "already excused" if at least one
      // active-employee excusal covers each selected department for
      // that training. For multi-dept selection, all picked depts
      // must already be covered.
      const trainingDeptsCovered = new Map<number, Set<string>>();
      for (const ex of excusals) {
        if (ex.employee_is_active === false) continue;
        const dept = (ex.employee_department ?? "").toLowerCase();
        if (!deptsLower.has(dept)) continue;
        if (!trainingDeptsCovered.has(ex.training_type_id)) {
          trainingDeptsCovered.set(ex.training_type_id, new Set());
        }
        trainingDeptsCovered.get(ex.training_type_id)!.add(dept);
      }
      for (const [ttId, coveredDepts] of trainingDeptsCovered.entries()) {
        if (info.has(ttId)) continue;
        let allCovered = true;
        for (const d of deptsLower) {
          if (!coveredDepts.has(d)) {
            allCovered = false;
            break;
          }
        }
        if (allCovered) {
          info.set(ttId, "Already excused for the selected department");
        }
      }
    }
    return info;
  }, [draft.kind, draft.departments, rules, excusals]);

  const lockedTrainingIds = useMemo(
    () => new Set(lockedTrainingInfo.keys()),
    [lockedTrainingInfo]
  );

  // Reason string shown as a tooltip + subtle label on locked rows
  // so HR understands why they can't pick the training.
  function lockReason(id: number): string | null {
    return lockedTrainingInfo.get(id) ?? null;
  }

  function toggleTraining(id: number) {
    // Silently ignore clicks on locked rows — UI also shows them as
    // disabled but this is a belt-and-suspenders guard for keyboard
    // activation.
    if (lockedTrainingIds.has(id)) return;
    setDraft((d) => {
      const next = new Set(d.training_type_ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...d, training_type_ids: next };
    });
  }

  function toggleDepartment(dept: string) {
    setDraft((d) => {
      const next = new Set(d.departments);
      if (next.has(dept)) {
        next.delete(dept);
      } else if (d.scope === "position") {
        // Position scope — positions are dept-specific, so only one dept
        // at a time. Replace whatever was selected, and clear the
        // position checks so they don't leak across depts.
        next.clear();
        next.add(dept);
        return {
          ...d,
          departments: next,
          positions: new Set<string>(),
        };
      } else {
        next.add(dept);
      }
      return { ...d, departments: next };
    });
  }

  function togglePosition(pos: string) {
    setDraft((d) => {
      const next = new Set(d.positions);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return { ...d, positions: next };
    });
  }

  function setScope(scope: Scope) {
    setDraft((d) => ({
      ...d,
      scope,
      // Drop positions when leaving position scope, and collapse multi-
      // dept selection to one when entering it so the /api/positions
      // query has a single target.
      departments:
        scope === "position" && d.departments.size > 1
          ? new Set<string>([Array.from(d.departments)[0]])
          : d.departments,
      positions: scope === "position" ? d.positions : new Set<string>(),
    }));
  }

  function setKind(kind: RuleKind) {
    setDraft((d) => ({
      ...d,
      kind,
      // Excusing EVERYONE from a training is never the intent, so bounce
      // the universal scope off when the operator picks Excused.
      scope: kind === "excused" && d.scope === "universal" ? "department" : d.scope,
    }));
  }

  async function submitDraft() {
    setError(null);

    if (draft.training_type_ids.size === 0) {
      setError("Pick at least one training");
      return;
    }

    if (draft.scope !== "universal" && draft.departments.size === 0) {
      setError("Pick at least one department");
      return;
    }

    // Belt-and-suspenders: if any locked IDs snuck into the selection
    // (e.g. user toggled kind/department after checking), reject the
    // save. The UI already disables those checkboxes.
    if (draft.kind === "excused") {
      const stillLocked = Array.from(draft.training_type_ids).filter((id) =>
        lockedTrainingIds.has(id)
      );
      if (stillLocked.length > 0) {
        const names = stillLocked
          .map((id) => ttById.get(id)?.name ?? `#${id}`)
          .join(", ");
        setError(
          `Can't excuse training already required for this scope: ${names}`
        );
        return;
      }
    }

    if (draft.scope === "position" && draft.positions.size === 0) {
      setError("Pick at least one position");
      return;
    }

    if (draft.kind === "excused") {
      if (draft.scope === "universal") {
        setError("Excused rules require a department");
        return;
      }
      if (!draft.reason.trim()) {
        setError("Pick an excusal reason");
        return;
      }
    }

    setSaving(true);
    try {
      const trainingIds = Array.from(draft.training_type_ids);
      const depts =
        draft.scope === "universal" ? [""] : Array.from(draft.departments);
      const positions =
        draft.scope === "position" ? Array.from(draft.positions) : [""];

      const errors: string[] = [];

      for (const ttId of trainingIds) {
        for (const dept of depts) {
          for (const pos of positions) {
            if (draft.kind === "excused") {
              const tt = trainingTypes.find((t) => t.id === ttId);
              if (!tt) {
                errors.push(`Unknown training #${ttId}`);
                continue;
              }
              const body: Record<string, unknown> = {
                division: dept,
                trainingColumnKeys: [tt.column_key],
                reason: draft.reason.trim(),
              };
              if (pos) body.position = pos;
              const res = await fetch("/api/bulk-excuse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                errors.push(
                  `${tt.name} — ${dept}${pos ? ` / ${pos}` : ""}: ${j.error ?? "failed"}`
                );
              }
            } else {
              const body: Record<string, unknown> = {
                training_type_id: ttId,
                is_universal: draft.scope === "universal",
                is_required: true,
                notes: draft.notes || null,
              };
              if (dept) body.department = dept;
              if (pos) body.position = pos;
              const res = await fetch("/api/required-trainings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                const ttName = ttById.get(ttId)?.name ?? `#${ttId}`;
                errors.push(
                  `${ttName}${dept ? ` — ${dept}` : ""}${pos ? ` / ${pos}` : ""}: ${j.error ?? "failed"}`
                );
              }
            }
          }
        }
      }

      if (errors.length > 0) {
        setError(
          `${errors.length} rule(s) failed: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? "…" : ""}`
        );
      }

      // After a successful add, jump the rules table to the tab the
      // new rules landed in so HR can see their work. Excused rules
      // land in the excusals table, not required_trainings, so surface
      // them on the Excusals tab.
      if (draft.kind === "required") {
        setTab(draft.scope);
      } else {
        setTab("excusals");
      }

      setDraft(freshDraft());
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

  async function deleteExcusal(exc: ExcusalRow) {
    const who =
      exc.employee_last_name && exc.employee_first_name
        ? `${exc.employee_first_name} ${exc.employee_last_name}`
        : "this employee";
    const what = exc.training_name ?? "this training";
    if (!confirm(`Remove excusal for ${who} — ${what}?`)) return;
    setDeletingExcusalId(exc.id);
    setError(null);
    try {
      const res = await fetch("/api/excusal/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: exc.employee_id,
          training_type_id: exc.training_type_id,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Delete failed");
      // Optimistically drop it from the table so HR sees the effect
      // immediately; load() below reconciles.
      setExcusals((list) => list.filter((e) => e.id !== exc.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingExcusalId(null);
    }
  }

  // Filtered view for the Excusals tab. Matches across employee name,
  // department, training name, and reason code — the fields the
  // operator actually searches on when hunting down a specific entry.
  const filteredExcusals = useMemo(() => {
    const q = excusalFilter.trim().toLowerCase();
    if (!q) return excusals;
    return excusals.filter((e) => {
      const name = `${e.employee_first_name ?? ""} ${e.employee_last_name ?? ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (e.employee_department ?? "").toLowerCase().includes(q) ||
        (e.employee_position ?? "").toLowerCase().includes(q) ||
        (e.training_name ?? "").toLowerCase().includes(q) ||
        (e.reason ?? "").toLowerCase().includes(q) ||
        (e.source ?? "").toLowerCase().includes(q)
      );
    });
  }, [excusals, excusalFilter]);

  const submitLabel = saving
    ? "Saving…"
    : draft.kind === "excused"
      ? `Excuse (${previewCount(draft)})`
      : `Add (${previewCount(draft)})`;

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
          less-specific ones. You can mass-select trainings and departments to
          create many rules at once.
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

        {/* Required vs Excused */}
        <div className="flex gap-2 mb-4">
          {(["required", "excused"] as const).map((k) => {
            const active = draft.kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
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

        {/* Scope picker */}
        <div className="mb-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Scope
          </span>
          <div className="flex gap-2 flex-wrap">
            {(["universal", "department", "position"] as const)
              .filter((s) => !(draft.kind === "excused" && s === "universal"))
              .map((s) => {
                const active = draft.scope === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      active
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {s === "universal"
                      ? "Universal"
                      : s === "department"
                        ? "Department"
                        : "Dept + position"}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Trainings multi-select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Trainings
                <span className="text-slate-400 font-normal ml-1">
                  ({draft.training_type_ids.size} selected)
                </span>
              </span>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      training_type_ids: new Set(
                        trainingTypes
                          .filter((t) => !lockedTrainingIds.has(t.id))
                          .map((t) => t.id)
                      ),
                    }))
                  }
                  className="text-blue-600 hover:underline"
                >
                  Select all
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, training_type_ids: new Set() }))
                  }
                  className="text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto bg-white">
              {trainingTypes.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400">
                  No trainings available.
                </p>
              )}
              {trainingTypes.map((tt) => {
                const checked = draft.training_type_ids.has(tt.id);
                const locked = lockedTrainingIds.has(tt.id);
                const reason = locked ? lockReason(tt.id) : null;
                return (
                  <label
                    key={tt.id}
                    title={reason ?? undefined}
                    className={
                      "flex items-center gap-2 px-3 py-2 text-sm border-b border-slate-50 last:border-0 " +
                      (locked
                        ? "cursor-not-allowed opacity-50 bg-slate-50"
                        : "cursor-pointer hover:bg-slate-50")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked && !locked}
                      disabled={locked}
                      onChange={() => toggleTraining(tt.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                    />
                    <span
                      className={
                        locked
                          ? "text-slate-500"
                          : checked
                          ? "text-slate-900 font-medium"
                          : "text-slate-600"
                      }
                    >
                      {tt.name}
                    </span>
                    {locked && reason && (
                      <span className="ml-auto text-[10px] text-slate-400 italic">
                        {reason}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Departments multi-select (hidden for universal scope) */}
          {draft.scope !== "universal" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Departments
                  <span className="text-slate-400 font-normal ml-1">
                    ({draft.departments.size} selected
                    {draft.scope === "position" ? ", pick 1" : ""})
                  </span>
                </span>
                {draft.scope === "department" && (
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          departments: new Set(divisions),
                        }))
                      }
                      className="text-blue-600 hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({ ...d, departments: new Set() }))
                      }
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto bg-white">
                {divisions.length === 0 && (
                  <p className="px-3 py-4 text-xs text-slate-400">
                    No departments loaded.
                  </p>
                )}
                {divisions.map((dept) => {
                  const checked = draft.departments.has(dept);
                  return (
                    <label
                      key={dept}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                      <input
                        type={draft.scope === "position" ? "radio" : "checkbox"}
                        name="rt-dept"
                        checked={checked}
                        onChange={() => toggleDepartment(dept)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span
                        className={
                          checked
                            ? "text-slate-900 font-medium"
                            : "text-slate-600"
                        }
                      >
                        {formatDivision(dept)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Positions multi-select — only when position scope + dept picked */}
        {draft.scope === "position" && positionDept && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Positions in {formatDivision(positionDept)}
                <span className="text-slate-400 font-normal ml-1">
                  ({draft.positions.size} selected)
                </span>
              </span>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      positions: new Set(positionsForDept),
                    }))
                  }
                  className="text-blue-600 hover:underline"
                >
                  Select all
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, positions: new Set() }))
                  }
                  className="text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-white">
              {loadingPositions ? (
                <div className="px-3 py-4 text-center">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400 mx-auto" />
                </div>
              ) : positionsForDept.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-400">
                  No positions found for this department.
                </p>
              ) : (
                positionsForDept.map((pos) => {
                  const checked = draft.positions.has(pos);
                  return (
                    <label
                      key={pos}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePosition(pos)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span
                        className={
                          checked
                            ? "text-slate-900 font-medium"
                            : "text-slate-600"
                        }
                      >
                        {pos}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Reason or Notes — differs by kind */}
        {draft.kind === "excused" ? (
          <label className="block mt-5">
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
        ) : (
          <label className="block mt-5">
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

        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={submitDraft}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
              draft.kind === "excused"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {submitLabel}
          </button>
          <p className="text-[11px] text-slate-400">
            {draft.kind === "excused"
              ? "Excused writes an excusal row for every active employee in the selected scope. Re-running is safe."
              : "Required writes to the required_trainings table. Toggle Required/Waived or delete rules below."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-0">
        {(["universal", "department", "position", "excusals"] as const).map((s) => (
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
            {s === "position"
              ? "Dept + position"
              : s === "excusals"
                ? "Excusals"
                : s}{" "}
            ({s === "excusals" ? excusals.length : grouped[s].length})
          </button>
        ))}
      </div>

      {/* Rules table — required_trainings view */}
      {tab !== "excusals" && (
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
                    <td className="px-5 py-3 text-slate-700">
                      {formatDivision(rule.department ?? "")}
                    </td>
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
      )}

      {/* Excusals table — one row per (employee, training) excusal */}
      {tab === "excusals" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={excusalFilter}
              onChange={(e) => setExcusalFilter(e.target.value)}
              placeholder="Filter by employee, department, training, reason…"
              className="flex-1 min-w-[240px] px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400">
              Showing {filteredExcusals.length} of {excusals.length} excusal
              {excusals.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Training</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExcusals.map((exc) => {
                  const name =
                    exc.employee_last_name || exc.employee_first_name
                      ? `${exc.employee_last_name ?? ""}, ${exc.employee_first_name ?? ""}`
                          .replace(/^, /, "")
                          .replace(/, $/, "")
                      : `(deleted #${exc.employee_id.slice(0, 8)})`;
                  const isInactive = exc.employee_is_active === false;
                  return (
                    <tr key={exc.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {name}
                        {isInactive && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {formatDivision(exc.employee_department ?? "")}
                        {exc.employee_position && (
                          <span className="text-slate-400 text-xs block">
                            {exc.employee_position}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {exc.training_name ??
                          `(unknown #${exc.training_type_id})`}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          {exc.reason}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {exc.source}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {exc.created_at
                          ? new Date(exc.created_at).toLocaleDateString()
                          : ""}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => deleteExcusal(exc)}
                          disabled={deletingExcusalId === exc.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          title="Remove excusal"
                        >
                          {deletingExcusalId === exc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredExcusals.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-slate-400"
                    >
                      {excusals.length === 0
                        ? "No excusals yet. Use the Add Rule form above with the Excused kind."
                        : "No excusals match the filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pretty "N rule(s)" count for the submit button. */
function previewCount(draft: NewRuleDraft): string {
  const trainings = draft.training_type_ids.size;
  const depts = draft.scope === "universal" ? 1 : draft.departments.size;
  const positions = draft.scope === "position" ? draft.positions.size : 1;
  const total = trainings * depts * positions;
  return `${total} rule${total === 1 ? "" : "s"}`;
}
