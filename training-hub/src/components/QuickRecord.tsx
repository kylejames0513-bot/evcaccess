"use client";

import { useState, useEffect, useRef } from "react";
import { X, Zap, Check, AlertTriangle, Loader2, Search } from "lucide-react";
import { TRAINING_DEFINITIONS, AUTO_FILL_RULES } from "@/config/trainings";

interface QuickRecordProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill employee name */
  defaultEmployee?: string;
  /** Pre-fill training column key */
  defaultTraining?: string;
}

interface Employee {
  name: string;
  position: string;
}

// Build a human-readable description of what will auto-fill when a training is recorded
function getLinkedNote(columnKey: string): string {
  const links = AUTO_FILL_RULES.filter(
    (r) => r.source.toUpperCase() === columnKey.toUpperCase()
  );
  if (links.length === 0) return "";
  return links
    .map((r) => {
      if (r.offsetDays === 0) return `Also records ${r.target} (same date)`;
      if (r.offsetDays === 1) return `Also records ${r.target} (+1 day)`;
      if (r.offsetDays === -1) return `Also records ${r.target} (−1 day)`;
      return `Also records ${r.target} (${r.offsetDays > 0 ? "+" : ""}${r.offsetDays} days)`;
    })
    .join(" · ");
}

// Today's date in YYYY-MM-DD for date input
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function QuickRecord({ isOpen, onClose, defaultEmployee = "", defaultTraining = "" }: QuickRecordProps) {
  const [employeeSearch, setEmployeeSearch] = useState(defaultEmployee);
  const [selectedEmployee, setSelectedEmployee] = useState(defaultEmployee);
  const [trainingKey, setTrainingKey] = useState(defaultTraining);
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load employees once
  useEffect(() => {
    if (!isOpen) return;
    setLoadingEmployees(true);
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setEmployees((d.employees || []).map((e: Employee) => ({ name: e.name, position: e.position }))))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, [isOpen]);

  // Sync default values when opened
  useEffect(() => {
    if (isOpen) {
      setEmployeeSearch(defaultEmployee);
      setSelectedEmployee(defaultEmployee);
      setTrainingKey(defaultTraining);
      setDate(todayISO());
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultEmployee, defaultTraining]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = employees
    .filter((e) => e.name.toLowerCase().includes(employeeSearch.toLowerCase()))
    .slice(0, 12);

  function handleEmployeePick(name: string) {
    setSelectedEmployee(name);
    setEmployeeSearch(name);
    setShowDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee || !trainingKey || !date) return;
    setSubmitting(true);
    setResult(null);

    // Convert YYYY-MM-DD to M/D/YYYY
    const [y, m, d2] = date.split("-");
    const formattedDate = `${parseInt(m)}/${parseInt(d2)}/${y}`;

    try {
      const res = await fetch("/api/record-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: selectedEmployee,
          trainingColumnKey: trainingKey,
          completionDate: formattedDate,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: body.error || "Failed to record" });
      } else {
        setResult({ ok: true, message: body.message || "Recorded successfully" });
        // Reset form for next entry, keep employee selected
        setTrainingKey("");
        setDate(todayISO());
      }
    } catch {
      setResult({ ok: false, message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  const linkedNote = trainingKey ? getLinkedNote(trainingKey) : "";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center gap-3">
          <div className="bg-white/20 rounded-lg p-1.5">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">Quick Record</h2>
            <p className="text-emerald-100 text-xs">Record a training completion instantly</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Employee */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Employee
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setSelectedEmployee("");
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name…"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoComplete="off"
              />
              {loadingEmployees && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />
              )}
            </div>
            {showDropdown && employeeSearch && filtered.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filtered.map((emp) => (
                  <button
                    key={emp.name}
                    type="button"
                    onClick={() => handleEmployeePick(emp.name)}
                    className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    <span className="font-medium text-slate-900">{emp.name}</span>
                    {emp.position && <span className="text-slate-400 ml-2 text-xs">{emp.position}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Training */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Training
            </label>
            <select
              value={trainingKey}
              onChange={(e) => setTrainingKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">Select training…</option>
              {/* Deduplicate by columnKey so each column appears once */}
              {Array.from(
                new Map(TRAINING_DEFINITIONS.map((t) => [t.columnKey, t])).values()
              ).map((t) => (
                <option key={t.columnKey} value={t.columnKey}>
                  {t.name}
                </option>
              ))}
            </select>
            {linkedNote && (
              <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                <Zap className="h-3 w-3" /> {linkedNote}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Completion Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Result banner */}
          {result && (
            <div className={`rounded-xl p-3 flex items-start gap-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {result.ok
                ? <Check className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{result.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {result?.ok ? "Done" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedEmployee || !trainingKey || !date}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {submitting ? "Recording…" : "Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
