"use client";

import { useState, useEffect } from "react";
import { ClipboardCheck, Loader2, Check, Save } from "lucide-react";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// Get unique column keys with display names
const ALL_TRAININGS = (() => {
  const seen = new Set<string>();
  const result: { columnKey: string; name: string }[] = [];
  for (const def of TRAINING_DEFINITIONS) {
    if (!seen.has(def.columnKey)) {
      seen.add(def.columnKey);
      result.push({ columnKey: def.columnKey, name: def.name });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
})();

export default function SettingsPage() {
  const [tracks, setTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/compliance-tracks")
      .then((r) => r.json())
      .then((data) => {
        if (data.tracks) setTracks(new Set(data.tracks));
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    const next = new Set(tracks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTracks(next);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/compliance-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: Array.from(tracks) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">System configuration</p>
      </div>

      {/* Compliance Tracks */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Compliance Tracking</h2>
              <p className="text-xs text-slate-500">Choose which trainings appear on the Dashboard, Compliance, and Employee pages</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              saved
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-[#1e3a5f] text-white hover:bg-[#2a4d7a]"
            }`}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><Check className="h-4 w-4" /> Saved</>
            ) : (
              <><Save className="h-4 w-4" /> Save Changes</>
            )}
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ALL_TRAININGS.map(({ columnKey, name }) => {
              const isTracked = tracks.has(columnKey);
              const def = TRAINING_DEFINITIONS.find((d) => d.columnKey === columnKey);
              const renewalLabel = def && def.renewalYears > 0
                ? `${def.renewalYears}-year renewal`
                : "One-time";

              return (
                <button
                  key={columnKey}
                  onClick={() => toggle(columnKey)}
                  className={`w-full flex items-center justify-between px-6 py-3.5 text-left transition-colors ${
                    isTracked ? "bg-blue-50/50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isTracked ? "bg-[#1e3a5f] border-[#1e3a5f]" : "border-slate-300"
                    }`}>
                      {isTracked && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <div>
                      <span className={`text-sm font-medium ${isTracked ? "text-slate-900" : "text-slate-500"}`}>
                        {name}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">({columnKey})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{renewalLabel}</span>
                    {isTracked && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                        Tracked
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            {tracks.size} training{tracks.size !== 1 ? "s" : ""} tracked.
            Untracked trainings won&apos;t appear in compliance reports or employee detail views.
          </p>
        </div>
      </div>
    </div>
  );
}
