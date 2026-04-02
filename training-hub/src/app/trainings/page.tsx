"use client";

import { useState, useEffect } from "react";
import { Search, BookOpen, Clock, Users as UsersIcon, Pencil, Check, X } from "lucide-react";
import { PRIMARY_TRAININGS } from "@/config/primary-trainings";
import StatusBadge from "@/components/ui/StatusBadge";

export default function TrainingsPage() {
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  // Load capacity overrides
  useEffect(() => {
    fetch("/api/capacities")
      .then((r) => r.json())
      .then((d) => setOverrides(d.overrides || {}))
      .catch(() => {});
  }, []);

  const filtered = PRIMARY_TRAININGS.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  function getCapacity(name: string, defaultCap: number) {
    return overrides[name] ?? defaultCap;
  }

  async function saveCapacity(name: string, capacity: number) {
    try {
      const res = await fetch("/api/capacity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingName: name, capacity }),
      });
      const data = await res.json();
      if (res.ok) setOverrides(data.overrides || {});
    } catch {}
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Training Catalog</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {PRIMARY_TRAININGS.length} primary trainings — click seats to edit capacity
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search trainings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Training cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((training) => (
          <TrainingCard
            key={training.name}
            training={training}
            capacity={getCapacity(training.name, training.classCapacity)}
            onSaveCapacity={(cap) => saveCapacity(training.name, cap)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">No trainings match your search.</div>
      )}
    </div>
  );
}

function TrainingCard({
  training,
  capacity,
  onSaveCapacity,
}: {
  training: (typeof PRIMARY_TRAININGS)[number];
  capacity: number;
  onSaveCapacity: (cap: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(capacity.toString());

  function handleSave() {
    const num = parseInt(editValue);
    if (!isNaN(num) && num >= 1) {
      onSaveCapacity(num);
    }
    setEditing(false);
  }

  function handleCancel() {
    setEditValue(capacity.toString());
    setEditing(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 card-hover">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{training.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{training.columnKey}</p>
          </div>
        </div>
        {training.isRequired && <StatusBadge status="expired" />}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {training.renewalYears > 0 ? `${training.renewalYears}-year renewal` : "One-time"}
          </div>
          {training.prerequisite && (
            <span className="text-orange-600 font-medium">Req: {training.prerequisite}</span>
          )}
        </div>

        {/* Editable capacity */}
        <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <UsersIcon className="h-3.5 w-3.5" />
            <span>Class seats</span>
          </div>
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
                autoFocus
                className="w-16 px-2 py-0.5 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={handleSave} className="p-0.5 hover:bg-emerald-100 rounded text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleCancel} className="p-0.5 hover:bg-red-100 rounded text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditValue(capacity.toString()); setEditing(true); }}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors group"
            >
              {capacity}
              <Pencil className="h-3 w-3 text-slate-300 group-hover:text-blue-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
