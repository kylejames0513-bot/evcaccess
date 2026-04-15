"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Pencil, Plus, Trash2, X, Check } from "lucide-react";
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
  job_title: string | null;
  status: string;
  notes: string | null;
  employee_id: string | null;
};

type Draft = Partial<
  Pick<
    Row,
    | "sheet"
    | "row_number"
    | "section"
    | "last_name"
    | "first_name"
    | "hire_date"
    | "paylocity_id"
    | "division"
    | "department"
    | "position"
    | "job_title"
    | "status"
    | "notes"
  >
>;

export default function TrackerNewHiresPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSheet, setFilterSheet] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

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
    job_title: "",
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

  const filteredRows = useMemo(() => {
    let list = [...rows];
    const fs = filterSheet.trim().toLowerCase();
    const st = filterStatus.trim().toLowerCase();
    if (fs) list = list.filter((r) => r.sheet.toLowerCase().includes(fs));
    if (st) list = list.filter((r) => r.status.toLowerCase().includes(st));
    list.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row_number - b.row_number);
    return list;
  }, [rows, filterSheet, filterStatus]);

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          job_title: form.job_title || null,
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
      job_title: "",
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
    if (editingId === id) setEditingId(null);
    await load();
  }

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft({
      sheet: r.sheet,
      row_number: r.row_number,
      section: r.section,
      last_name: r.last_name,
      first_name: r.first_name,
      hire_date: r.hire_date,
      paylocity_id: r.paylocity_id ?? "",
      division: r.division ?? "",
      department: r.department ?? "",
      position: r.position ?? "",
      job_title: r.job_title ?? "",
      status: r.status,
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
      const patch: Record<string, unknown> = {
        sheet: draft.sheet,
        row_number: draft.row_number,
        section: draft.section,
        last_name: draft.last_name,
        first_name: draft.first_name,
        hire_date: draft.hire_date,
        paylocity_id: draft.paylocity_id || null,
        division: draft.division || null,
        department: draft.department || null,
        position: draft.position || null,
        job_title: draft.job_title || null,
        status: draft.status,
        notes: draft.notes || null,
      };
      const res = await fetch(`/api/tracker-rows/new-hires/${id}`, {
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

  if (loading) return <Loading message="Loading tracker rows..." />;
  if (error && rows.length === 0) return <ErrorState message={error} />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-blue-600" />
          New hire workbook rows
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Hub copy of Monthly New Hire Tracker positions (sheet + row) for audit and Excel sync correlation. Successful{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">POST /api/sync/new-hires</code> upserts a row here when{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">sheet</code> and <code className="text-xs bg-slate-100 px-1 rounded">row_number</code>{" "}
          are present in the payload.
        </p>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

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
        <Field label="Job title" value={form.job_title} onChange={(v) => setForm({ ...form, job_title: v })} />
        <Field label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
        <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} className="sm:col-span-2" />
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

      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl p-4">
        <label className="block flex-1 min-w-[140px]">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Filter sheet</span>
          <input
            value={filterSheet}
            onChange={(e) => setFilterSheet(e.target.value)}
            placeholder="contains…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block flex-1 min-w-[120px]">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Filter status</span>
          <input
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            placeholder="contains…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <span className="text-xs text-slate-400 ml-auto self-end pb-2">{filteredRows.length} row(s)</span>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="min-w-[960px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Sheet</th>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Sec</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Hire</th>
              <th className="px-3 py-2 hidden lg:table-cell">Div / Dept</th>
              <th className="px-3 py-2 hidden md:table-cell">Position</th>
              <th className="px-3 py-2 hidden xl:table-cell">Job title</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2 hidden lg:table-cell">Employee</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 hidden xl:table-cell">Notes</th>
              <th className="px-3 py-2 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) =>
              editingId === r.id ? (
                <tr key={r.id} className="border-t border-slate-100 bg-amber-50/40">
                  <td className="px-2 py-1">
                    <input
                      className="w-24 border rounded px-1 py-1 text-xs"
                      value={draft.sheet ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, sheet: e.target.value }))}
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
                    <input
                      className="w-20 border rounded px-1 py-1 text-xs"
                      value={draft.section ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex flex-col gap-1">
                      <input
                        className="w-28 border rounded px-1 py-0.5 text-xs"
                        value={draft.last_name ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
                      />
                      <input
                        className="w-28 border rounded px-1 py-0.5 text-xs"
                        value={draft.first_name ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-28 border rounded px-1 py-1 text-xs"
                      value={draft.hire_date ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, hire_date: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 hidden lg:table-cell">
                    <div className="flex flex-col gap-1">
                      <input
                        className="w-24 border rounded px-1 text-xs"
                        placeholder="div"
                        value={draft.division ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, division: e.target.value }))}
                      />
                      <input
                        className="w-24 border rounded px-1 text-xs"
                        placeholder="dept"
                        value={draft.department ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1 hidden md:table-cell">
                    <input
                      className="w-28 border rounded px-1 text-xs"
                      value={draft.position ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 hidden xl:table-cell">
                    <input
                      className="w-32 border rounded px-1 text-xs"
                      value={draft.job_title ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-20 border rounded px-1 text-xs"
                      value={draft.paylocity_id ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, paylocity_id: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 hidden lg:table-cell text-xs text-slate-400">—</td>
                  <td className="px-2 py-1">
                    <input
                      className="w-20 border rounded px-1 text-xs"
                      value={draft.status ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1 hidden xl:table-cell">
                    <input
                      className="w-40 border rounded px-1 text-xs"
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
                  <td className="px-3 py-2">{r.sheet}</td>
                  <td className="px-3 py-2">{r.row_number}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.section}</td>
                  <td className="px-3 py-2">
                    {r.first_name} {r.last_name}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.hire_date}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 hidden lg:table-cell max-w-[140px]">
                    <div className="line-clamp-2">{r.division ?? "—"}</div>
                    <div className="line-clamp-2 text-slate-400">{r.department ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-slate-600">{r.position ?? "—"}</td>
                  <td className="px-3 py-2 hidden xl:table-cell text-slate-600 max-w-[160px] line-clamp-2">{r.job_title ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.paylocity_id ?? "—"}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {r.employee_id ? (
                      <Link href={`/employees/${r.employee_id}`} className="text-blue-600 hover:underline text-xs font-mono">
                        link
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 hidden xl:table-cell text-xs text-slate-500 max-w-[200px] line-clamp-2" title={r.notes ?? ""}>
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
              ? "No rows yet. Add one above or run Excel push sync with sheet + row in the payload."
              : "No rows match the current filters."}
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
