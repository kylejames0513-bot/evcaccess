"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTrainingAction, type TrainingUpdateFields } from "@/app/actions/training-update";

export type TrainingRow = {
  id: string;
  code: string;
  title: string;
  category: string | null;
  cadence_type: string;
  cadence_months: number | null;
  grace_days: number;
  regulatory_citation: string | null;
  active: boolean;
  completionCount: number;
};

const CATEGORIES = ["clinical", "safety", "compliance", "orientation", "other"];
const CADENCE_TYPES = [
  { value: "unset", label: "Unset" },
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual (12 mo)" },
  { value: "biennial", label: "Biennial (24 mo)" },
  { value: "custom", label: "Custom" },
];

// Sensible defaults when cadence_type changes
function defaultMonthsForCadence(cadence: string): number | null {
  switch (cadence) {
    case "monthly": return 1;
    case "annual": return 12;
    case "biennial": return 24;
    case "custom": return 12;
    case "one_time": return null;
    case "unset": return null;
    default: return null;
  }
}

export function TrainingCatalogTable({ rows: initialRows }: { rows: TrainingRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<"all" | "unset" | "configured" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [pendingCadence, setPendingCadence] = useState<{
    row: TrainingRow;
    nextCadenceType: string;
    nextCadenceMonths: number | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const unconfiguredCount = rows.filter(r => r.cadence_type === "unset").length;
  const configuredCount = rows.filter(r => r.cadence_type !== "unset" && r.active).length;
  const inactiveCount = rows.filter(r => !r.active).length;

  const filtered = rows.filter(r => {
    if (filter === "unset" && r.cadence_type !== "unset") return false;
    if (filter === "configured" && (r.cadence_type === "unset" || !r.active)) return false;
    if (filter === "inactive" && r.active) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    return true;
  });

  function commitUpdate(id: string, fields: TrainingUpdateFields, optimistic: Partial<TrainingRow>) {
    startTransition(async () => {
      // Optimistic update
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...optimistic } : r));
      const result = await updateTrainingAction(id, fields);
      if (!result.ok) {
        toast.error(`Update failed: ${result.error}`);
        // Revert
        setRows(prev => prev.map(r => r.id === id ? (initialRows.find(i => i.id === id) ?? r) : r));
      } else {
        if (result.rowsUpdated !== undefined && result.rowsUpdated > 0) {
          toast.success(`Updated. Recomputed ${result.rowsUpdated} completion${result.rowsUpdated === 1 ? "" : "s"}.`);
        } else {
          toast.success("Saved");
        }
      }
    });
  }

  function handleCellEdit(id: string, field: string) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setEditing({ id, field });
    setEditValue(String((row as unknown as Record<string, unknown>)[field] ?? ""));
  }

  function handleCellSave(id: string, field: string) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    const current = (row as unknown as Record<string, unknown>)[field];
    if (String(current ?? "") === editValue) {
      setEditing(null);
      return;
    }
    commitUpdate(id, { [field]: editValue } as TrainingUpdateFields, { [field]: editValue } as Partial<TrainingRow>);
    setEditing(null);
  }

  function handleCadenceTypeChange(row: TrainingRow, nextType: string) {
    const nextMonths = defaultMonthsForCadence(nextType);
    // If cadence changes and there are existing completions, confirm first
    if (row.completionCount > 0 && (nextType !== row.cadence_type || nextMonths !== row.cadence_months)) {
      setPendingCadence({ row, nextCadenceType: nextType, nextCadenceMonths: nextMonths });
      return;
    }
    commitUpdate(
      row.id,
      { cadence_type: nextType as TrainingUpdateFields["cadence_type"], cadence_months: nextMonths },
      { cadence_type: nextType, cadence_months: nextMonths }
    );
  }

  function handleCadenceMonthsChange(row: TrainingRow, nextMonths: number | null) {
    if (row.completionCount > 0 && nextMonths !== row.cadence_months) {
      setPendingCadence({ row, nextCadenceType: row.cadence_type, nextCadenceMonths: nextMonths });
      return;
    }
    commitUpdate(row.id, { cadence_months: nextMonths }, { cadence_months: nextMonths });
  }

  function confirmCadenceChange() {
    if (!pendingCadence) return;
    const { row, nextCadenceType, nextCadenceMonths } = pendingCadence;
    commitUpdate(
      row.id,
      { cadence_type: nextCadenceType as TrainingUpdateFields["cadence_type"], cadence_months: nextCadenceMonths },
      { cadence_type: nextCadenceType, cadence_months: nextCadenceMonths }
    );
    setPendingCadence(null);
  }

  function toggleActive(row: TrainingRow) {
    commitUpdate(row.id, { active: !row.active }, { active: !row.active });
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 text-sm">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label={`All ${rows.length}`} />
        <FilterButton active={filter === "unset"} onClick={() => setFilter("unset")} label={`Unconfigured ${unconfiguredCount}`} />
        <FilterButton active={filter === "configured"} onClick={() => setFilter("configured")} label={`Configured ${configuredCount}`} />
        <FilterButton active={filter === "inactive"} onClick={() => setFilter("inactive")} label={`Inactive ${inactiveCount}`} />

        <div className="ml-auto flex items-center gap-2">
          <label className="caption">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-[--rule] bg-[--surface] px-2 py-1 text-sm text-[--ink]"
          >
            <option value="all">All</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Unconfigured warning */}
      {unconfiguredCount > 0 && filter !== "unset" && (
        <div className="rounded-lg border border-[--warn-soft] bg-[--warn-soft] px-4 py-3">
          <p className="text-sm text-[--warn]">
            <strong>{unconfiguredCount} training{unconfiguredCount === 1 ? "" : "s"}</strong> have no renewal timeframe set.
            Completions for these will never flag as overdue until configured.
          </p>
          <button
            onClick={() => setFilter("unset")}
            className="mt-1 text-xs font-medium text-[--warn] underline underline-offset-2"
          >
            Show only unconfigured
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--rule]">
              <th className="caption px-4 py-3 text-left">Code</th>
              <th className="caption px-4 py-3 text-left">Title</th>
              <th className="caption px-4 py-3 text-left">Category</th>
              <th className="caption px-4 py-3 text-left">Cadence Type</th>
              <th className="caption px-4 py-3 text-left">Months</th>
              <th className="caption px-4 py-3 text-left">Grace Days</th>
              <th className="caption px-4 py-3 text-left">Citation</th>
              <th className="caption px-4 py-3 text-right">Completions</th>
              <th className="caption px-4 py-3 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr
                key={row.id}
                className={`border-b border-[--rule] last:border-0 hover:bg-[--surface-alt] transition-colors ${!row.active ? "opacity-60" : ""}`}
              >
                <td className="px-4 py-3 font-mono text-xs text-[--ink-muted]">{row.code}</td>

                {/* Title (inline editable) */}
                <td className="px-4 py-3 font-medium">
                  {editing?.id === row.id && editing.field === "title" ? (
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleCellSave(row.id, "title")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCellSave(row.id, "title"); if (e.key === "Escape") setEditing(null); }}
                      autoFocus
                      className="w-full rounded border border-[--accent] bg-[--bg] px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => handleCellEdit(row.id, "title")}
                      className="w-full text-left hover:text-[--accent]"
                    >
                      {row.title}
                    </button>
                  )}
                </td>

                {/* Category (dropdown) */}
                <td className="px-4 py-3">
                  <select
                    value={row.category ?? ""}
                    onChange={(e) => commitUpdate(row.id, { category: e.target.value || undefined }, { category: e.target.value || null })}
                    className="rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-[--ink-soft] hover:border-[--rule] focus:border-[--accent] focus:outline-none"
                  >
                    <option value="">—</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>

                {/* Cadence type */}
                <td className="px-4 py-3">
                  <select
                    value={row.cadence_type}
                    onChange={(e) => handleCadenceTypeChange(row, e.target.value)}
                    disabled={isPending}
                    className={`rounded border px-2 py-1 text-xs font-medium ${
                      row.cadence_type === "unset"
                        ? "border-[--warn] bg-[--warn-soft] text-[--warn]"
                        : "border-[--rule] bg-[--surface] text-[--ink]"
                    }`}
                  >
                    {CADENCE_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </td>

                {/* Cadence months */}
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={row.cadence_months ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      // Update local state immediately for responsive UI
                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, cadence_months: val } : r));
                    }}
                    onBlur={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      handleCadenceMonthsChange(row, val);
                    }}
                    disabled={row.cadence_type === "unset" || row.cadence_type === "one_time"}
                    placeholder={row.cadence_type === "unset" || row.cadence_type === "one_time" ? "—" : "0"}
                    className="w-16 rounded border border-transparent bg-transparent px-2 py-0.5 text-sm tabular-nums text-[--ink] hover:border-[--rule] focus:border-[--accent] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </td>

                {/* Grace days */}
                <td className="px-4 py-3">
                  <input
                    type="number"
                    defaultValue={row.grace_days}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      if (val !== row.grace_days) commitUpdate(row.id, { grace_days: val }, { grace_days: val });
                    }}
                    className="w-16 rounded border border-transparent bg-transparent px-2 py-0.5 text-sm tabular-nums text-[--ink] hover:border-[--rule] focus:border-[--accent] focus:outline-none"
                  />
                </td>

                {/* Regulatory citation */}
                <td className="px-4 py-3 max-w-[200px] truncate">
                  {editing?.id === row.id && editing.field === "regulatory_citation" ? (
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleCellSave(row.id, "regulatory_citation")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCellSave(row.id, "regulatory_citation"); if (e.key === "Escape") setEditing(null); }}
                      autoFocus
                      className="w-full rounded border border-[--accent] bg-[--bg] px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => handleCellEdit(row.id, "regulatory_citation")}
                      className="w-full text-left text-[--ink-muted] hover:text-[--accent]"
                    >
                      {row.regulatory_citation || "—"}
                    </button>
                  )}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-[--ink-muted]">
                  {row.completionCount > 0 ? row.completionCount : "—"}
                </td>

                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive(row)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                      row.active
                        ? "bg-[--success-soft] text-[--success] hover:bg-[--success-soft]/80"
                        : "bg-[--surface-alt] text-[--ink-muted] hover:bg-[--surface-alt]/80"
                    }`}
                  >
                    {row.active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm cadence change modal */}
      {pendingCadence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[--rule] bg-[--surface] p-6 shadow-lg">
            <h3 className="font-display text-lg font-medium">Confirm cadence change</h3>
            <p className="mt-2 text-sm text-[--ink-soft]">
              Changing <strong className="text-[--ink]">{pendingCadence.row.title}</strong> will
              recompute expiration dates on <strong className="text-[--ink]">{pendingCadence.row.completionCount}</strong> completion record{pendingCadence.row.completionCount === 1 ? "" : "s"}.
            </p>
            <div className="mt-4 rounded bg-[--surface-alt] p-3 text-sm">
              <div className="text-[--ink-muted]">From:</div>
              <div className="text-[--ink]">
                {pendingCadence.row.cadence_type} · {pendingCadence.row.cadence_months ?? "—"} months
              </div>
              <div className="mt-2 text-[--ink-muted]">To:</div>
              <div className="text-[--accent]">
                {pendingCadence.nextCadenceType} · {pendingCadence.nextCadenceMonths ?? "—"} months
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setPendingCadence(null)}
                className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm hover:bg-[--surface-alt]"
              >
                Cancel
              </button>
              <button
                onClick={confirmCadenceChange}
                className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[--accent-soft] text-[--accent]"
          : "text-[--ink-muted] hover:bg-[--surface-alt]"
      }`}
    >
      {label}
    </button>
  );
}
