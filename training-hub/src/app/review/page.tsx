"use client";

import { useEffect, useState } from "react";

interface UnresolvedPerson {
  id: string;
  source: string;
  full_name: string | null;
  last_name: string | null;
  first_name: string | null;
  paylocity_id: string | null;
  reason: string;
  suggested_employee_id: string | null;
  created_at: string;
}

interface UnknownTraining {
  id: string;
  source: string;
  raw_name: string;
  occurrence_count: number;
  suggested_training_type_id: number | null;
  created_at: string;
}

interface EmployeeOption {
  id: string;
  last_name: string;
  first_name: string;
  paylocity_id: string | null;
}

interface TrainingTypeOption {
  id: number;
  name: string;
}

/**
 * /review
 *
 * Two tabs: people and trainings. Each list comes from
 * /api/review/people and /api/review/trainings respectively. Resolving
 * a row attaches it to a real employee or training_type and (for
 * trainings) creates an alias for future imports.
 */
export default function ReviewPage() {
  const [tab, setTab] = useState<"people" | "trainings">("people");
  const [people, setPeople] = useState<UnresolvedPerson[]>([]);
  const [trainings, setTrainings] = useState<UnknownTraining[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingTypeOption[]>([]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [p, t, e, tt] = await Promise.all([
      fetch("/api/review/people").then((r) => r.json()),
      fetch("/api/review/trainings").then((r) => r.json()),
      fetch("/api/employees?active=all").then((r) => r.json()),
      fetch("/api/training-types").then((r) => r.json()),
    ]);
    setPeople(p.unresolved_people ?? []);
    setTrainings(t.unknown_trainings ?? []);
    setEmployees((e.employees ?? []).map((emp: EmployeeOption) => ({
      id: emp.id,
      last_name: emp.last_name,
      first_name: emp.first_name,
      paylocity_id: emp.paylocity_id,
    })));
    setTrainingTypes(
      (tt.training_types ?? [])
        .filter((x: TrainingTypeOption & { is_active?: boolean }) => x.is_active !== false)
        .sort((a: TrainingTypeOption, b: TrainingTypeOption) => a.name.localeCompare(b.name))
    );
  }

  async function resolvePerson(id: string, employeeId: string) {
    if (!employeeId) return;
    await fetch(`/api/review/people/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved_to_employee_id: employeeId }),
    });
    void load();
  }

  async function resolveTraining(id: string, trainingTypeId: number) {
    if (!trainingTypeId) return;
    await fetch(`/api/review/trainings/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved_to_training_type_id: trainingTypeId }),
    });
    void load();
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Resolution Review</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Review queue for import rows the resolver could not match. Resolving a row attaches it to a real employee or training. Resolved trainings also create an alias so future imports pick them up automatically.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("people")}
          className={`px-4 py-2 text-sm font-medium ${tab === "people" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
        >
          People ({people.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("trainings")}
          className={`px-4 py-2 text-sm font-medium ${tab === "trainings" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
        >
          Trainings ({trainings.length})
        </button>
      </div>

      {tab === "people" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Paylocity ID</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Resolve to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map((row) => (
                <PersonRow
                  key={row.id}
                  row={row}
                  employees={employees}
                  onResolve={(empId) => resolvePerson(row.id, empId)}
                />
              ))}
              {people.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">No open items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "trainings" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Raw name</th>
                <th className="px-5 py-3 text-right">Occurrences</th>
                <th className="px-5 py-3">Resolve to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trainings.map((row) => (
                <TrainingRow
                  key={row.id}
                  row={row}
                  trainingTypes={trainingTypes}
                  onResolve={(tid) => resolveTraining(row.id, tid)}
                />
              ))}
              {trainings.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">No open items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PersonRow({
  row,
  employees,
  onResolve,
}: {
  row: UnresolvedPerson;
  employees: EmployeeOption[];
  onResolve: (employeeId: string) => void;
}) {
  // Try to auto-match: suggested_employee_id, or paylocity_id, or exact name
  const autoMatch = (() => {
    if (row.suggested_employee_id) {
      const emp = employees.find((e) => e.id === row.suggested_employee_id);
      if (emp) return emp;
    }
    if (row.paylocity_id) {
      const emp = employees.find((e) => e.paylocity_id === row.paylocity_id);
      if (emp) return emp;
    }
    if (row.last_name && row.first_name) {
      const matches = employees.filter(
        (e) =>
          e.last_name?.toLowerCase() === row.last_name!.toLowerCase() &&
          e.first_name?.toLowerCase() === row.first_name!.toLowerCase()
      );
      if (matches.length === 1) return matches[0];
    }
    return null;
  })();

  const [selected, setSelected] = useState(autoMatch?.id ?? row.suggested_employee_id ?? "");

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-5 py-3 text-slate-500">{row.source}</td>
      <td className="px-5 py-3 font-medium text-slate-900">{row.full_name ?? `${row.last_name ?? ""}, ${row.first_name ?? ""}`}</td>
      <td className="px-5 py-3 text-slate-500 font-mono text-xs">{row.paylocity_id ?? ""}</td>
      <td className="px-5 py-3 text-slate-500">{row.reason}</td>
      <td className="px-5 py-3">
        {autoMatch ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">
              {autoMatch.last_name}, {autoMatch.first_name}
              {autoMatch.paylocity_id ? <span className="text-slate-400 ml-1">({autoMatch.paylocity_id})</span> : ""}
            </span>
            <button
              type="button"
              onClick={() => onResolve(autoMatch.id)}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setSelected("")}
              className="text-xs text-slate-400 hover:text-slate-600"
              title="Pick a different employee"
            >
              change
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-xs"
            >
              <option value="">Pick employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.last_name}, {e.first_name} {e.paylocity_id ? `(${e.paylocity_id})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onResolve(selected)}
              disabled={!selected}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Resolve
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function TrainingRow({
  row,
  trainingTypes,
  onResolve,
}: {
  row: UnknownTraining;
  trainingTypes: TrainingTypeOption[];
  onResolve: (id: number) => void;
}) {
  const [selected, setSelected] = useState<string>(row.suggested_training_type_id?.toString() ?? "");
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-5 py-3 text-slate-500">{row.source}</td>
      <td className="px-5 py-3 font-mono text-slate-900">{row.raw_name}</td>
      <td className="px-5 py-3 text-right text-slate-500">{row.occurrence_count}</td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Pick training</option>
            {trainingTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selected && onResolve(parseInt(selected, 10))}
            disabled={!selected}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            Resolve + add alias
          </button>
        </div>
      </td>
    </tr>
  );
}
