"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Save, Clock } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">
          Expiration windows for the compliance dashboard. Required and
          excused training rules live on the{" "}
          <a
            href="/required-trainings"
            className="text-blue-600 hover:underline"
          >
            Required Trainings
          </a>{" "}
          page.
        </p>
      </div>

      {/* Expiration Thresholds */}
      <ThresholdSection />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Expiration Threshold Section
// ────────────────────────────────────────────────────────────

function ThresholdSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState(90);
  const [warning, setWarning] = useState(60);
  const [critical, setCritical] = useState(30);

  useEffect(() => {
    fetch("/api/compliance")
      .then((r) => r.json())
      .then((d) => {
        if (d.thresholds) {
          setNotice(d.thresholds.notice);
          setWarning(d.thresholds.warning);
          setCritical(d.thresholds.critical);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice, warning, critical }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Clock className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Expiration Thresholds</h2>
          <p className="text-xs text-slate-500">Configure when trainings are flagged as expiring on the compliance dashboard</p>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" /></div>
      ) : (
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notice (days)</label>
              <input
                type="number"
                min={1}
                value={notice}
                onChange={(e) => setNotice(parseInt(e.target.value) || 90)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-[10px] text-yellow-600 mt-0.5">Yellow zone</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Warning (days)</label>
              <input
                type="number"
                min={1}
                value={warning}
                onChange={(e) => setWarning(parseInt(e.target.value) || 60)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-[10px] text-amber-600 mt-0.5">Amber zone</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Critical (days)</label>
              <input
                type="number"
                min={1}
                value={critical}
                onChange={(e) => setCritical(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-[10px] text-red-600 mt-0.5">Red zone</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Thresholds
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg p-3 text-sm font-medium">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
