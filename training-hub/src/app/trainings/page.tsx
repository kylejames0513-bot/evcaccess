"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Tag, X, ChevronDown, ChevronRight } from "lucide-react";

interface TrainingType {
  id: number;
  name: string;
  column_key: string;
  renewal_years: number;
  is_required: boolean;
  class_capacity: number;
  is_active: boolean;
  aliases: string[];
}

interface EditState {
  id: number | null;
  name: string;
  column_key: string;
  renewal_years: number;
  is_required: boolean;
  class_capacity: number;
  is_active: boolean;
}

const emptyEdit: EditState = {
  id: null, name: "", column_key: "", renewal_years: 0,
  is_required: false, class_capacity: 15, is_active: true,
};

export default function TrainingCatalogPage() {
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newAlias, setNewAlias] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/training-types");
      const j = await r.json();
      setTypes(j.training_types ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const url = editing.id === null ? "/api/training-types" : `/api/training-types/${editing.id}`;
      const method = editing.id === null ? "POST" : "PATCH";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          column_key: editing.column_key || editing.name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
          renewal_years: editing.renewal_years,
          is_required: editing.is_required,
          class_capacity: editing.class_capacity,
          is_active: editing.is_active,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setEditing(null);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function addAlias(trainingId: number) {
    if (!newAlias.trim()) return;
    await fetch(`/api/training-types/${trainingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_alias", alias: newAlias.trim() }),
    });
    setNewAlias("");
    void load();
  }

  async function removeAlias(trainingId: number, aliasText: string) {
    // Need the alias id. For now, refetch aliases then find by text.
    const r = await fetch(`/api/training-types/${trainingId}`);
    const j = await r.json();
    const aliasRow = (j.aliases ?? []).find((a: { alias: string; id: number }) => a.alias === aliasText);
    if (aliasRow) {
      await fetch(`/api/training-types/${trainingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_alias", alias_id: aliasRow.id }),
      });
      void load();
    }
  }

  async function toggleActive(tt: TrainingType) {
    await fetch(`/api/training-types/${tt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !tt.is_active }),
    });
    void load();
  }

  if (loading) return <div className="p-6 text-gray-500">Loading training catalog...</div>;

  const active = types.filter(t => t.is_active);
  const inactive = types.filter(t => !t.is_active);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Training catalog</h1>
          <p className="text-sm text-gray-500">{active.length} active, {inactive.length} inactive</p>
        </div>
        <button type="button" onClick={() => setEditing({ ...emptyEdit })}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">
          <Plus className="h-4 w-4" /> Add training
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

      {editing && (
        <div className="bg-white rounded-lg shadow p-4 mb-6 border-2 border-blue-200">
          <h2 className="font-semibold mb-3">{editing.id === null ? "Add new training" : `Edit: ${editing.name}`}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Name</span>
              <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 block w-full rounded border-gray-300 text-sm px-2 py-1.5" placeholder="e.g. CPR/FA" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Column key (for imports)</span>
              <input type="text" value={editing.column_key} onChange={e => setEditing({ ...editing, column_key: e.target.value })}
                className="mt-1 block w-full rounded border-gray-300 text-sm px-2 py-1.5" placeholder="e.g. CPR" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Renewal period (years, 0 = one time)</span>
              <input type="number" min={0} value={editing.renewal_years} onChange={e => setEditing({ ...editing, renewal_years: parseInt(e.target.value) || 0 })}
                className="mt-1 block w-full rounded border-gray-300 text-sm px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Class capacity</span>
              <input type="number" min={1} value={editing.class_capacity} onChange={e => setEditing({ ...editing, class_capacity: parseInt(e.target.value) || 15 })}
                className="mt-1 block w-full rounded border-gray-300 text-sm px-2 py-1.5" />
            </label>
            <label className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
                className="rounded border-gray-300 text-blue-600" />
              <span className="text-sm">Active</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving || !editing.name}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50">
              {saving ? "Saving..." : editing.id === null ? "Create" : "Save changes"}
            </button>
            <button type="button" onClick={() => { setEditing(null); setError(null); }}
              className="px-4 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left w-8"></th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Key</th>
              <th className="px-3 py-2 text-center">Renewal</th>
              <th className="px-3 py-2 text-center">Capacity</th>
              <th className="px-3 py-2 text-center">Aliases</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[...active, ...inactive].map(tt => (
              <TrainingRow key={tt.id} tt={tt}
                expanded={expandedId === tt.id}
                onToggleExpand={() => setExpandedId(expandedId === tt.id ? null : tt.id)}
                onEdit={() => setEditing({ id: tt.id, name: tt.name, column_key: tt.column_key, renewal_years: tt.renewal_years, is_required: tt.is_required, class_capacity: tt.class_capacity, is_active: tt.is_active })}
                onToggleActive={() => toggleActive(tt)}
                newAlias={expandedId === tt.id ? newAlias : ""}
                onNewAliasChange={setNewAlias}
                onAddAlias={() => addAlias(tt.id)}
                onRemoveAlias={(alias) => removeAlias(tt.id, alias)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrainingRow({ tt, expanded, onToggleExpand, onEdit, onToggleActive, newAlias, onNewAliasChange, onAddAlias, onRemoveAlias }: {
  tt: TrainingType; expanded: boolean; onToggleExpand: () => void; onEdit: () => void; onToggleActive: () => void;
  newAlias: string; onNewAliasChange: (v: string) => void; onAddAlias: () => void; onRemoveAlias: (alias: string) => void;
}) {
  return (
    <>
      <tr className={`border-t ${!tt.is_active ? "opacity-50" : ""}`}>
        <td className="px-3 py-2">
          <button type="button" onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-2 font-medium">
          <Link href={`/trainings/${tt.id}`} className="text-blue-600 hover:underline">{tt.name}</Link>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-gray-500">{tt.column_key}</td>
        <td className="px-3 py-2 text-center">{tt.renewal_years > 0 ? `${tt.renewal_years} yr` : "Once"}</td>
        <td className="px-3 py-2 text-center">{tt.class_capacity}</td>
        <td className="px-3 py-2 text-center">{tt.aliases.length}</td>
        <td className="px-3 py-2 text-center">
          <button type="button" onClick={onToggleActive}
            className={`text-xs rounded px-2 py-0.5 ${tt.is_active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
            {tt.is_active ? "Active" : "Inactive"}
          </button>
        </td>
        <td className="px-3 py-2 text-right">
          <button type="button" onClick={onEdit} className="text-gray-400 hover:text-blue-600">
            <Pencil className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t bg-gray-50">
          <td></td>
          <td colSpan={7} className="px-3 py-3">
            <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Aliases (names from other systems that map to this training)
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {tt.aliases.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-white border rounded px-2 py-1 text-xs">
                  {a}
                  <button type="button" onClick={() => onRemoveAlias(a)} className="text-gray-400 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {tt.aliases.length === 0 && <span className="text-xs text-gray-400">No aliases yet. Add one so imports from Paylocity/PHS/Access can match this training.</span>}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newAlias} onChange={e => onNewAliasChange(e.target.value)}
                placeholder="Add alias (e.g. 'med training', 'CPR.FA')..." className="rounded border-gray-300 text-xs px-2 py-1 w-64"
                onKeyDown={e => { if (e.key === "Enter") onAddAlias(); }} />
              <button type="button" onClick={onAddAlias} disabled={!newAlias.trim()}
                className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50">Add</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
