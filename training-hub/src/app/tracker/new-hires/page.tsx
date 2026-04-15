"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";

type Row = {
  id: string;
  sheet: string;
  row_number: number;
  section: string;
  last_name: string;
  first_name: string;
  hire_date: string;
  paylocity_id: string | null;
  division: string | null;
  department: string | null;
  position: string | null;
  status: string;
  notes: string | null;
};

export default function TrackerNewHiresPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sheet: "January",
    row_number: 5,
    section: "new_hire",
    last_name: "",
    first_name: "",
    hire_date: "",
    paylocity_id: "",
    division: "",
    department: "",
    position: "",
    status: "active",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker-rows/new-hires");
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
    const res = await fetch("/api/tracker-rows/new-hires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        row: {
          sheet: form.sheet,
          row_number: form.row_number,
          section: form.section,
          last_name: form.last_name,
          first_name: form.first_name,
          hire_date: form.hire_date,
          paylocity_id: form.paylocity_id || null,
          division: form.division || null,
          department: form.department || null,
          position: form.position || null,
          status: form.status,
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
      hire_date: "",
      paylocity_id: "",
      notes: "",
    }));
  }

  async function remove(id: string) {
    if (!confirm("Delete this row?")) return;
    const res = await fetch(`/api/tracker-rows/new-hires/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  if (loading) return <Loading message="Loading tracker rows..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-blue-600" />
          New hire workbook rows
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Hub copy of Monthly New Hire Tracker positions (sheet + row) for audit and Excel sync
          correlation. VBA still pushes to <code className="text-xs bg-slate-100 px-1 rounded">/api/sync/new-hires</code>
          .
        </p>
      </div>

      <form
        onSubmit={addRow}
        className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Sheet" value={form.sheet} onChange={(v) => setForm({ ...form, sheet: v })} />
        <Field
          label="Row #"
          value={String(form.row_number)}
          onChange={(v) => setForm({ ...form, row_number: Number(v) || 0 })}
        />
        <Field label="Section" value={form.section} onChange={(v) => setForm({ ...form, section: v })} />
        <Field label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
        <Field
          label="First name"
          value={form.first_name}
          onChange={(v) => setForm({ ...form, first_name: v })}
          required
        />
        <Field
          label="Hire date"
          value={form.hire_date}
          onChange={(v) => setForm({ ...form, hire_date: v })}
          placeholder="yyyy-mm-dd"
          required
        />
        <Field label="Paylocity ID" value={form.paylocity_id} onChange={(v) => setForm({ ...form, paylocity_id: v })} />
        <Field label="Division" value={form.division} onChange={(v) => setForm({ ...form, division: v })} />
        <Field label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
        <Field label="Position" value={form.position} onChange={(v) => setForm({ ...form, position: v })} />
        <Field label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
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
              <th className="px-3 py-2">Sheet</th>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Hire</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.sheet}</td>
                <td className="px-3 py-2">{r.row_number}</td>
                <td className="px-3 py-2">
                  {r.first_name} {r.last_name}
                </td>
                <td className="px-3 py-2">{r.hire_date}</td>
                <td className="px-3 py-2 text-slate-500">{r.paylocity_id ?? "—"}</td>
                <td className="px-3 py-2">{r.status}</td>
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
          <p className="p-6 text-center text-slate-500 text-sm">No rows yet. Add one above or run Excel push sync.</p>
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
