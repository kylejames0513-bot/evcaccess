"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEnrollmentsAction,
  removeEnrollmentAction,
  updateEnrollmentStatusAction,
} from "@/app/actions/session-enrollment";
import type { CandidateEmployee, RosterCandidates } from "@/lib/roster-candidates";
import { Pill } from "@/components/training-hub/page-primitives";
import { cn } from "@/lib/utils";

type EnrollmentRow = {
  id: string;
  employee_id: string;
  status: string | null;
  source: string | null;
  enrolled_at: string | null;
  attendance_marked_at: string | null;
  notes: string | null;
  employee: {
    id: string;
    legal_first_name: string;
    legal_last_name: string;
    preferred_name: string | null;
    department: string | null;
    location: string | null;
    position: string | null;
  } | null;
};

type Props = {
  sessionId: string;
  sessionStatus: string | null;
  enrollments: EnrollmentRow[];
  candidates: RosterCandidates;
};

export function RosterPanel({
  sessionId,
  sessionStatus,
  enrollments,
  candidates,
}: Props) {
  const [isAdding, startAdd] = useTransition();
  const [isMutating, startMutate] = useTransition();
  const [picker, setPicker] = useState<Record<string, Set<string>>>({}); // bucket key → selected ids
  const [search, setSearch] = useState("");
  const router = useRouter();

  const isClosed = sessionStatus === "completed" || sessionStatus === "cancelled";

  const filteredBuckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.buckets;
    return candidates.buckets
      .map((b) => ({
        ...b,
        members: b.members.filter((m) => matchesName(m, q)),
      }))
      .filter((b) => b.members.length > 0);
  }, [candidates.buckets, search]);

  function togglePick(bucket: string, empId: string) {
    setPicker((prev) => {
      const next = { ...prev };
      const set = new Set(next[bucket] ?? []);
      if (set.has(empId)) set.delete(empId);
      else set.add(empId);
      next[bucket] = set;
      return next;
    });
  }

  function selectAllInBucket(bucket: string, members: CandidateEmployee[]) {
    setPicker((prev) => ({
      ...prev,
      [bucket]: new Set(members.map((m) => m.id)),
    }));
  }

  function clearBucket(bucket: string) {
    setPicker((prev) => ({ ...prev, [bucket]: new Set() }));
  }

  async function addSelected(bucket: string, source: string) {
    const ids = [...(picker[bucket] ?? [])];
    if (ids.length === 0) return;

    const form = new FormData();
    form.set("session_id", sessionId);
    form.set("employee_ids", JSON.stringify(ids));
    form.set("source", source);

    startAdd(async () => {
      await addEnrollmentsAction(form);
      clearBucket(bucket);
      router.refresh();
    });
  }

  async function changeStatus(enrollmentId: string, status: string) {
    const form = new FormData();
    form.set("enrollment_id", enrollmentId);
    form.set("status", status);
    startMutate(async () => {
      await updateEnrollmentStatusAction(form);
      router.refresh();
    });
  }

  async function remove(enrollmentId: string) {
    const form = new FormData();
    form.set("enrollment_id", enrollmentId);
    startMutate(async () => {
      await removeEnrollmentAction(form);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Current roster */}
      <div className="panel overflow-x-auto">
        {enrollments.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[--ink-muted]">
            No attendees yet. Add people from the suggestions below.
          </div>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">Attendee</th>
                <th className="caption px-4 py-3 text-left">Department</th>
                <th className="caption px-4 py-3 text-left">Position</th>
                <th className="caption px-4 py-3 text-left">Source</th>
                <th className="caption px-4 py-3 text-left">Status</th>
                <th className="caption px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const emp = e.employee;
                const nameCell = emp
                  ? formatDisplayName(emp.legal_last_name, emp.legal_first_name, emp.preferred_name)
                  : "—";
                return (
                  <tr key={e.id} className="border-b border-[--rule] last:border-0">
                    <td className="px-4 py-3 text-[--ink]">{nameCell}</td>
                    <td className="px-4 py-3 text-[--ink-soft]">
                      {emp?.department ?? emp?.location ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[--ink-soft]">{emp?.position ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[--ink-muted]">{e.source ?? "manual"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusControl
                        current={e.status ?? "enrolled"}
                        disabled={isClosed || isMutating}
                        onChange={(s) => changeStatus(e.id, s)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={isClosed || isMutating}
                        onClick={() => remove(e.id)}
                        className="text-xs text-[--alert] hover:underline disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Candidate buckets */}
      {isClosed ? null : candidates.buckets.length === 0 ? (
        <div className="panel px-5 py-4 text-sm text-[--ink-muted]">
          No auto-suggestions for this training. Use manual search to add attendees.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="caption">Add attendees</p>
            <input
              type="search"
              placeholder="Filter by name…"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              className="input max-w-xs"
            />
          </div>

          {filteredBuckets.map((b) => {
            const picks = picker[b.key] ?? new Set<string>();
            const sourceTag =
              b.key === "overdue"
                ? "auto_overdue"
                : b.key === "due_soon"
                  ? "auto_due_soon"
                  : b.key === "new_hire"
                    ? "auto_new_hire"
                    : "auto_never";
            return (
              <div key={b.key} className="panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--rule] bg-[--surface-alt] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[--ink]">{b.label}</p>
                    <p className="text-xs text-[--ink-muted]">{b.hint}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllInBucket(b.key, b.members)}
                      className="text-xs text-[--ink-soft] hover:text-[--ink]"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => clearBucket(b.key)}
                      className="text-xs text-[--ink-soft] hover:text-[--ink]"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={picks.size === 0 || isAdding}
                      onClick={() => addSelected(b.key, sourceTag)}
                      className="inline-flex h-8 items-center rounded-md bg-[--accent] px-3 text-xs font-medium text-[--primary-foreground] transition hover:opacity-90 disabled:opacity-40 focus-ring"
                    >
                      {isAdding ? "Adding…" : `Add ${picks.size || "0"}`}
                    </button>
                  </div>
                </div>
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <tbody>
                      {b.members.map((m) => {
                        const checked = picks.has(m.id);
                        const name = formatDisplayName(m.legal_last_name, m.legal_first_name, m.preferred_name);
                        const statusHint =
                          m.expires_on
                            ? `expires ${m.expires_on}`
                            : m.last_completed_on
                              ? `last ${m.last_completed_on}`
                              : "never completed";
                        return (
                          <tr
                            key={m.id}
                            className={cn(
                              "border-b border-[--rule] last:border-0",
                              checked && "bg-[--accent-soft]",
                            )}
                          >
                            <td className="w-8 px-4 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePick(b.key, m.id)}
                                className="size-4 rounded border-[--rule]"
                              />
                            </td>
                            <td className="px-4 py-2 text-[--ink]">{name}</td>
                            <td className="px-4 py-2 text-[--ink-soft]">
                              {m.department ?? m.location ?? "—"}
                              {m.position ? ` · ${m.position}` : ""}
                            </td>
                            <td className="px-4 py-2 text-xs text-[--ink-muted]">{statusHint}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {filteredBuckets.length === 0 && (
            <div className="panel px-5 py-4 text-sm text-[--ink-muted]">
              No matches for <span className="italic">{search}</span>.
            </div>
          )}
        </div>
      )}

      {isClosed && (
        <Pill tone="muted">
          This session is {sessionStatus}. Roster is read-only.
        </Pill>
      )}
    </div>
  );
}

function StatusControl({
  current,
  disabled,
  onChange,
}: {
  current: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const options: { value: string; label: string; tone: "default" | "success" | "warn" | "alert" | "muted" }[] = [
    { value: "enrolled", label: "Enrolled", tone: "default" },
    { value: "confirmed", label: "Confirmed", tone: "default" },
    { value: "attended", label: "Attended", tone: "success" },
    { value: "no_show", label: "No-show", tone: "alert" },
    { value: "excused", label: "Excused", tone: "warn" },
    { value: "waitlisted", label: "Waitlisted", tone: "muted" },
  ];
  return (
    <select
      disabled={disabled}
      value={current}
      onChange={(ev) => onChange(ev.target.value)}
      className="input h-8 min-w-[110px] py-0 text-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function matchesName(c: CandidateEmployee, q: string): boolean {
  return (
    c.legal_last_name.toLowerCase().includes(q) ||
    c.legal_first_name.toLowerCase().includes(q) ||
    (c.preferred_name ?? "").toLowerCase().includes(q) ||
    (c.department ?? "").toLowerCase().includes(q) ||
    (c.position ?? "").toLowerCase().includes(q)
  );
}

function formatDisplayName(last: string, first: string, preferred: string | null): string {
  if (preferred && preferred.trim() && preferred.trim().toLowerCase() !== first.toLowerCase()) {
    return `${last}, ${first} (${preferred})`;
  }
  return `${last}, ${first}`;
}
