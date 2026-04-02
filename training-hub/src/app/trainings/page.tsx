"use client";

import { useState } from "react";
import { Search, Plus, BookOpen, Clock, Users as UsersIcon } from "lucide-react";
import { PRIMARY_TRAININGS } from "@/config/primary-trainings";
import StatusBadge from "@/components/ui/StatusBadge";

export default function TrainingsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "required" | "renewable">("all");

  const filtered = PRIMARY_TRAININGS.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "required" && t.isRequired) ||
      (filter === "renewable" && t.renewalYears > 0);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Training Catalog</h1>
          <p className="text-slate-500 mt-1">
            {PRIMARY_TRAININGS.length} training types configured
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" />
          Add Training
        </button>
      </div>

      {/* Search and filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search trainings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "required", "renewable"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === f
                  ? "bg-blue-100 text-blue-700"
                  : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
              }`}
            >
              {f === "all" ? "All" : f === "required" ? "Required" : "Has Renewal"}
            </button>
          ))}
        </div>
      </div>

      {/* Training grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((training) => (
          <div
            key={training.name}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{training.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Key: {training.columnKey}
                  </p>
                </div>
              </div>
              {training.isRequired && (
                <StatusBadge status="needed" />
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {training.renewalYears > 0
                  ? `${training.renewalYears}-year renewal`
                  : "One-time"}
              </div>
              <div className="flex items-center gap-1">
                <UsersIcon className="h-3.5 w-3.5" />
                {training.classCapacity} seats
              </div>
              {training.schedule && (
                <div className="text-blue-600 font-medium">
                  Recurring schedule
                </div>
              )}
              {training.prerequisite && (
                <div className="text-orange-600 font-medium">
                  Requires: {training.prerequisite}
                </div>
              )}
            </div>

            {training.aliases && training.aliases.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {training.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No trainings match your search.
        </div>
      )}
    </div>
  );
}
