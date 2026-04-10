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
      fetch("/api/needs-training").then((r) => r.json()).catch(() => ({ trainings: [] })),
    ]);
    setPeople(p.unresolved_people ?? []);
    setTrainings(t.unknown_trainings ?? []);
    setEmployees((e.employees ?? []).map((emp: EmployeeOption) => ({
      id: emp.id,
      last_name: emp.last_name,
      first_name: emp.first_name,
      paylocity_id: emp.paylocity_id,
    })));
    setTrainingTypes(tt.trainings ?? []);
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
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Resolution review</h1>
      <p className="text-gray-600 mb-6">
        Review queue for import rows the resolver could not match. Resolving a row attaches it to a real employee or training. Resolved trainings also create an alias so future imports pick them up automatically.
      </p>

      <div className="border-b mb-4">
        <button
          type="button"
          onClick={() => setTab("people")}
          className={`px-4 py-2 ${tab === "people" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600"}`}
        >
          People ({people.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("trainings")}
          className={`px-4 py-2 ${tab === "trainings" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600"}`}
        >
          Trainings ({trainings.length})
        </button>
      </div>

      {tab === "people" && (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Paylocity ID</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Resolve to</th>
              </tr>
            </thead>
            <tbody>
              {people.map((row) => (
                <PersonRow
                  key={row.id}
                  row={row}
                  employees={employees}
                  onResolve={(empId) => resolvePerson(row.id, empId)}
                />
              ))}
              {people.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-gray-500">No open items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "trainings" && (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Raw name</th>
                <th className="px-3 py-2 text-right">Occurrences</th>
                <th className="px-3 py-2 text-left">Resolve to</th>
              </tr>
            </thead>
            <tbody>
              {trainings.map((row) => (
                <TrainingRow
                  key={row.id}
                  row={row}
                  trainingTypes={trainingTypes}
                  onResolve={(tid) => resolveTraining(row.id, tid)}
                />
              ))}
              {trainings.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-gray-500">No open items.</td></tr>
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
  const [selected, setSelected] = useState(row.suggested_employee_id ?? "");
  return (
    <tr className="border-t">
      <td className="px-3 py-2">{row.source}</td>
      <td className="px-3 py-2">{row.full_name ?? `${row.last_name ?? ""}, ${row.first_name ?? ""}`}</td>
      <td className="px-3 py-2">{row.paylocity_id ?? ""}</td>
      <td className="px-3 py-2">{row.reason}</td>
      <td className="px-3 py-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
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
          className="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
        >
          Resolve
        </button>
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
    <tr className="border-t">
      <td className="px-3 py-2">{row.source}</td>
      <td className="px-3 py-2 font-mono">{row.raw_name}</td>
      <td className="px-3 py-2 text-right">{row.occurrence_count}</td>
      <td className="px-3 py-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
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
          className="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
        >
          Resolve + add alias
        </button>
      </td>
    </tr>
  );
}
