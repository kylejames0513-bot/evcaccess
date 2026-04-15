"use client";

import { useCallback, useEffect, useState } from "react";

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

const PAGE_SIZE = 50;

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "paylocity", label: "Paylocity" },
  { value: "phs", label: "PHS" },
  { value: "access", label: "Access" },
  { value: "signin", label: "Sign-in" },
  { value: "manual", label: "Manual" },
  { value: "cutover", label: "Cutover" },
];

const REASON_OPTIONS = [
  { value: "", label: "Any reason" },
  { value: "no_match", label: "No match" },
  { value: "ambiguous", label: "Ambiguous" },
  { value: "invalid_id", label: "Invalid ID" },
  { value: "name_collision", label: "Name collision" },
  { value: "special_status", label: "Special status" },
  { value: "name_map_no_match", label: "Name map no match" },
];

/**
 * /review
 *
 * Two tabs: people and trainings. Each list is paginated server-side
 * (50 per page) and supports a text search + source filter so a post-
 * import queue of 500+ rows stays usable. Resolving a row attaches it
 * to a real employee or training_type and (for trainings) creates an
 * alias for future imports.
 */
export default function ReviewPage() {
  const [tab, setTab] = useState<"people" | "trainings">("people");

  // Shared lookup data
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingTypeOption[]>([]);

  // People queue state
  const [people, setPeople] = useState<UnresolvedPerson[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peoplePage, setPeoplePage] = useState(1);
  const [peopleSource, setPeopleSource] = useState("");
  const [peopleReason, setPeopleReason] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");

  // Trainings queue state
  const [trainings, setTrainings] = useState<UnknownTraining[]>([]);
  const [trainingsTotal, setTrainingsTotal] = useState(0);
  const [trainingsPage, setTrainingsPage] = useState(1);
  const [trainingsSource, setTrainingsSource] = useState("");
  const [trainingsSearch, setTrainingsSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load lookup data once.
  useEffect(() => {
    (async () => {
      try {
        const [e, tt] = await Promise.all([
          fetch("/api/employees?active=all").then((r) => r.json()),
          fetch("/api/training-types").then((r) => r.json()),
        ]);
        setEmployees(
          (e.employees ?? []).map((emp: EmployeeOption) => ({
            id: emp.id,
            last_name: emp.last_name,
            first_name: emp.first_name,
            paylocity_id: emp.paylocity_id,
          }))
        );
        setTrainingTypes(
          (tt.training_types ?? [])
            .filter(
              (x: TrainingTypeOption & { is_active?: boolean }) =>
                x.is_active !== false
            )
            .sort((a: TrainingTypeOption, b: TrainingTypeOption) =>
              a.name.localeCompare(b.name)
            )
        );
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(peoplePage),
        page_size: String(PAGE_SIZE),
      });
      if (peopleSource) qs.set("source", peopleSource);
      if (peopleReason) qs.set("reason", peopleReason);
      if (peopleSearch.trim()) qs.set("search", peopleSearch.trim());
      const res = await fetch(`/api/review/people?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setPeople(json.unresolved_people ?? []);
      setPeopleTotal(json.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [peoplePage, peopleSource, peopleReason, peopleSearch]);

  const loadTrainings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(trainingsPage),
        page_size: String(PAGE_SIZE),
      });
      if (trainingsSource) qs.set("source", trainingsSource);
      if (trainingsSearch.trim()) qs.set("search", trainingsSearch.trim());
      const res = await fetch(`/api/review/trainings?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setTrainings(json.unknown_trainings ?? []);
      setTrainingsTotal(json.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [trainingsPage, trainingsSource, trainingsSearch]);

  useEffect(() => {
    if (tab === "people") void loadPeople();
  }, [tab, loadPeople]);

  useEffect(() => {
    if (tab === "trainings") void loadTrainings();
  }, [tab, loadTrainings]);

  async function resolvePerson(id: string, employeeId: string) {
    if (!employeeId) return;
    const res = await fetch(`/api/review/people/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved_to_employee_id: employeeId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Resolve failed");
      return;
    }
    void loadPeople();
  }

  async function resolveTraining(id: string, trainingTypeId: number) {
    if (!trainingTypeId) return;
    const res = await fetch(`/api/review/trainings/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved_to_training_type_id: trainingTypeId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Resolve failed");
      return;
    }
    void loadTrainings();
  }

  const peoplePages = Math.max(1, Math.ceil(peopleTotal / PAGE_SIZE));
  const trainingsPages = Math.max(1, Math.ceil(trainingsTotal / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Resolution Review</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Review queue for import rows the resolver could not match.
          Resolving a row attaches it to a real employee or training.
          Resolved trainings also create an alias so future imports pick
          them up automatically.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-0">
        <button
          type="button"
          onClick={() => setTab("people")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "people"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          People ({tab === "people" ? peopleTotal : "…"})
        </button>
        <button
          type="button"
          onClick={() => setTab("trainings")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "trainings"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Trainings ({tab === "trainings" ? trainingsTotal : "…"})
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {tab === "people" && (
        <>
          <FilterBar>
            <input
              type="text"
              placeholder="Search name / Paylocity ID…"
              value={peopleSearch}
              onChange={(e) => {
                setPeoplePage(1);
                setPeopleSearch(e.target.value);
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex-1 min-w-[200px]"
            />
            <FilterSelect
              value={peopleSource}
              onChange={(v) => {
                setPeoplePage(1);
                setPeopleSource(v);
              }}
              options={SOURCE_OPTIONS}
            />
            <FilterSelect
              value={peopleReason}
              onChange={(v) => {
                setPeoplePage(1);
                setPeopleReason(v);
              }}
              options={REASON_OPTIONS}
            />
          </FilterBar>

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
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-sm text-slate-400"
                    >
                      {loading ? "Loading…" : "No open items."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={peoplePage}
            totalPages={peoplePages}
            total={peopleTotal}
            pageSize={PAGE_SIZE}
            onChange={setPeoplePage}
          />
        </>
      )}

      {tab === "trainings" && (
        <>
          <FilterBar>
            <input
              type="text"
              placeholder="Search raw name…"
              value={trainingsSearch}
              onChange={(e) => {
                setTrainingsPage(1);
                setTrainingsSearch(e.target.value);
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex-1 min-w-[200px]"
            />
            <FilterSelect
              value={trainingsSource}
              onChange={(v) => {
                setTrainingsPage(1);
                setTrainingsSource(v);
              }}
              options={SOURCE_OPTIONS}
            />
          </FilterBar>

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
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-sm text-slate-400"
                    >
                      {loading ? "Loading…" : "No open items."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={trainingsPage}
            totalPages={trainingsPages}
            total={trainingsTotal}
            pageSize={PAGE_SIZE}
            onChange={setTrainingsPage}
          />
        </>
      )}
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <div>
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{" "}
        <span className="font-medium text-slate-700">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span className="px-2 text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
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

  const [selected, setSelected] = useState(
    autoMatch?.id ?? row.suggested_employee_id ?? ""
  );

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-5 py-3 text-slate-500">{row.source}</td>
      <td className="px-5 py-3 font-medium text-slate-900">
        {row.full_name ?? `${row.last_name ?? ""}, ${row.first_name ?? ""}`}
      </td>
      <td className="px-5 py-3 text-slate-500 font-mono text-xs">
        {row.paylocity_id ?? ""}
      </td>
      <td className="px-5 py-3 text-slate-500">{row.reason}</td>
      <td className="px-5 py-3">
        {autoMatch ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">
              {autoMatch.last_name}, {autoMatch.first_name}
              {autoMatch.paylocity_id ? (
                <span className="text-slate-400 ml-1">
                  ({autoMatch.paylocity_id})
                </span>
              ) : (
                ""
              )}
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
                  {e.last_name}, {e.first_name}{" "}
                  {e.paylocity_id ? `(${e.paylocity_id})` : ""}
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
  const [selected, setSelected] = useState<string>(
    row.suggested_training_type_id?.toString() ?? ""
  );
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-5 py-3 text-slate-500">{row.source}</td>
      <td className="px-5 py-3 font-mono text-slate-900">{row.raw_name}</td>
      <td className="px-5 py-3 text-right text-slate-500">
        {row.occurrence_count}
      </td>
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
