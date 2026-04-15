"use client";

import { useCallback, useEffect, useState } from "react";
import { UserMinus, Plus, Trash2 } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";

type Row = {
  id: string;
  fy_sheet: string;
  row_number: number;
  last_name: string;
  first_name: string;
  date_of_separation: string;
  sync_status: string | null;
  notes: string | null;
};

export default function TrackerSeparationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
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
    await load();
  }

  if (loading) return <Loading message="Loading separation rows..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserMinus className="h-7 w-7 text-blue-600" />
          Separation workbook rows
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          FY sheet + row for each separation line. Excel macro posts terminations to{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">/api/sync/separations</code>; use this table for an
          in-hub audit trail.
        </p>
      </div>

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
        <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
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

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">FY sheet</th>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">DOS</th>
              <th className="px-3 py-2">Sync</th>
              <th className="px-3 py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.fy_sheet}</td>
                <td className="px-3 py-2">{r.row_number}</td>
                <td className="px-3 py-2">
                  {r.first_name} {r.last_name}
                </td>
                <td className="px-3 py-2">{r.date_of_separation}</td>
                <td className="px-3 py-2 text-slate-500">{r.sync_status ?? "—"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-slate-500 text-sm">No rows yet.</p>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
