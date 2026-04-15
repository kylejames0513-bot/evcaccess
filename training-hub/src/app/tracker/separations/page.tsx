"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UserMinus, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";

type Row = {
  id: string;
  fy_sheet: string;
  row_number: number;
  last_name: string;
  first_name: string;
  date_of_separation: string;
  employee_id: string | null;
  sync_status: string | null;
  notes: string | null;
};

type Draft = Partial<
  Pick<Row, "fy_sheet" | "row_number" | "last_name" | "first_name" | "date_of_separation" | "sync_status" | "notes">
>;

export default function TrackerSeparationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSheet, setFilterSheet] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fy_sheet: "FY 2026 (Jan26-Dec26)",
    row_number: 9,
    last_name: "",
    first_name: "",
    date_of_separation: "",
    sync_status: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker-rows/separations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const fs = filterSheet.trim().toLowerCase();
    let list = [...rows];
    if (fs) list = list.filter((r) => r.fy_sheet.toLowerCase().includes(fs));
    list.sort((a, b) => a.fy_sheet.localeCompare(b.fy_sheet) || a.row_number - b.row_number);
    return list;
  }, [rows, filterSheet]);

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/tracker-rows/separations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        row: {
          fy_sheet: form.fy_sheet,
          row_number: form.row_number,
          last_name: form.last_name,
          first_name: form.first_name,
          date_of_separation: form.date_of_separation,
          sync_status: form.sync_status || null,
          notes: form.notes || null,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    await load();
    setForm((f) => ({
      ...f,
      last_name: "",
      first_name: "",
      date_of_separation: "",
      sync_status: "",
      notes: "",
    }));
  }

  async function remove(id: string) {
    if (!confirm("Delete this row?")) return;
    const res = await fetch(`/api/tracker-rows/separations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Delete failed");
      return;
    }
    if (editingId === id) setEditingId(null);
    await load();
  }

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft({
      fy_sheet: r.fy_sheet,
      row_number: r.row_number,
      last_name: r.last_name,
      first_name: r.first_name,
      date_of_separation: r.date_of_separation,
      sync_status: r.sync_status ?? "",
      notes: r.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    try {
      const patch = {
        fy_sheet: draft.fy_sheet,
        row_number: draft.row_number,
        last_name: draft.last_name,
        first_name: draft.first_name,
        date_of_separation: draft.date_of_separation,
        sync_status: draft.sync_status || null,
        notes: draft.notes || null,
      };
      const res = await fetch(`/api/tracker-rows/separations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setEditingId(null);
      setDraft({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading message="Loading separation rows..." />;
  if (error && rows.length === 0) return <ErrorState message={error} />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserMinus className="h-7 w-7 text-blue-600" />
          Separation workbook rows
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          FY sheet + row for each separation line. Excel macro posts terminations to{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">/api/sync/separations</code>; when{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">sheet</code> and{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">row_number</code> are sent, the hub upserts an audit row here.
        </p>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      <form
        onSubmit={addRow}
        className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="FY sheet" value={form.fy_sheet} onChange={(v) => setForm({ ...form, fy_sheet: v })} />
        <Field
          label="Row #"
          value={String(form.row_number)}
          onChange={(v) => setForm({ ...form, row_number: Number(v) || 0 })}
        />
        <Field label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
        <Field
          label="First name"
          value={form.first_name}
          onChange={(v) => setForm({ ...form, first_name: v })}
          required
        />
        <Field
          label="Date of separation"
          value={form.date_of_separation}
          onChange={(v) => setForm({ ...form, date_of_separation: v })}
          placeholder="yyyy-mm-dd"
          required
        />
        <Field label="Sync status" value={form.sync_status} onChange={(v) => setForm({ ...form, sync_status: v })} />
        <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} className="sm:col-span-2" />
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl p-4">
        <label className="block flex-1 min-w-[180px]">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Filter FY sheet</span>
          <input
            value={filterSheet}
            onChange={(e) => setFilterSheet(e.target.value)}
            placeholder="contains…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <span className="text-xs text-slate-400 ml-auto self-end pb-2">{filteredRows.length} row(s)</span>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">FY sheet</th>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">DOS</th>
              <th className="px-3 py-2 hidden md:table-cell">Employee</th>
              <th className="px-3 py-2">Sync</th>
              <th className="px-3 py-2 hidden lg:table-cell">Notes</th>
              <th className="px-3 py-2 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) =>
              editingId === r.id ? (
                <tr key={r.id} className="border-t border-slate-100 bg-amber-50/40">
                  <td className="px-2 py-1">
                    <input
                      className="w-40 border rounded px-1 py-1 text-xs"
                      value={draft.fy_sheet ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, fy_sheet: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-14 border rounded px-1 py-1 text-xs"
                      value={draft.row_number ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, row_number: Number(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex flex-col gap-1">
                      <input
                        className="w-24 border rounded px-1 text-xs"
                        value={draft.last_name ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
                      />
                      <input
                        className="w-24 border rounded px-1 text-xs"
                        value={draft.first_name ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-28 border rounded px-1 text-xs"
                      value={draft.date_of_separation ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, date_of_separation: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 hidden md:table-cell text-xs text-slate-400">—</td>
                  <td className="px-2 py-1">
                    <input
                      className="w-24 border rounded px-1 text-xs"
                      value={draft.sync_status ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, sync_status: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 hidden lg:table-cell">
                    <input
                      className="w-48 border rounded px-1 text-xs"
                      value={draft.notes ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveEdit(r.id)}
                      className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded inline-flex"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1.5 text-slate-600 hover:bg-slate-100 rounded inline-flex"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-2 max-w-[200px] line-clamp-2" title={r.fy_sheet}>
                    {r.fy_sheet}
                  </td>
                  <td className="px-3 py-2">{r.row_number}</td>
                  <td className="px-3 py-2">
                    {r.first_name} {r.last_name}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date_of_separation}</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {r.employee_id ? (
                      <Link href={`/employees/${r.employee_id}`} className="text-blue-600 hover:underline text-xs font-mono">
                        link
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.sync_status ?? "—"}</td>
                  <td className="px-3 py-2 hidden lg:table-cell text-xs text-slate-500 max-w-[220px] line-clamp-2" title={r.notes ?? ""}>
                    {r.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded inline-flex mr-1"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded inline-flex"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        {filteredRows.length === 0 && (
          <p className="p-6 text-center text-slate-500 text-sm">
            {rows.length === 0
              ? "No rows yet. Add one above or run Excel separation sync with FY sheet + row in the payload."
              : "No rows match the current filter."}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-semibold text-slate-500 uppercase tracking-wide ${className ?? ""}`}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 font-normal normal-case"
      />
    </label>
  );
}
