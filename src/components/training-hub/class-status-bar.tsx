"use client";

import { updateClassStatusAction } from "@/app/actions/class";

const TRANSITIONS: Record<string, { label: string; next: string; tone: "primary" | "muted" | "alert" }[]> = {
  scheduled: [
    { label: "Start session", next: "in_progress", tone: "primary" },
    { label: "Cancel", next: "cancelled", tone: "alert" },
  ],
  in_progress: [
    { label: "Finalize & write completions", next: "completed", tone: "primary" },
    { label: "Cancel", next: "cancelled", tone: "alert" },
  ],
  completed: [
    { label: "Re-finalize (idempotent)", next: "completed", tone: "muted" },
  ],
  cancelled: [
    { label: "Reschedule", next: "scheduled", tone: "muted" },
  ],
};

export function ClassStatusBar({
  sessionId,
  status,
}: {
  sessionId: string;
  status: string | null;
}) {
  const current = status ?? "scheduled";
  const actions = TRANSITIONS[current] ?? [];

  if (actions.length === 0) return null;

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="caption">Status</p>
        <p className="mt-0.5 text-sm text-[--ink]">
          Current: <span className="font-medium">{current}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <form key={a.label} action={updateClassStatusAction}>
            <input type="hidden" name="session_id" value={sessionId} />
            <input type="hidden" name="status" value={a.next} />
            <button
              type="submit"
              className={
                a.tone === "primary"
                  ? "inline-flex h-9 items-center rounded-md bg-[--accent] px-3 text-sm font-medium text-[--primary-foreground] transition hover:opacity-90 focus-ring"
                  : a.tone === "alert"
                    ? "inline-flex h-9 items-center rounded-md border border-[--alert]/40 bg-[--alert-soft] px-3 text-sm font-medium text-[--alert] transition hover:bg-[--alert] hover:text-white focus-ring"
                    : "inline-flex h-9 items-center rounded-md border border-[--rule] px-3 text-sm font-medium text-[--ink-soft] transition hover:bg-[--surface-alt] focus-ring"
              }
            >
              {a.label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
