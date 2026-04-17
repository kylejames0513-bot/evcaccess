"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APPS_SCRIPT_FALLBACK =
  "https://script.google.com/macros/s/AKfycbzxZ8CQOcwuCSLrLwAP0MVsozi03uE6korbvfENrNgGRA_cs9Pgp-1tptRQGLz69GUXFA/exec";

const CLOCK_IN_URL = "https://infoservdd.com/login/";

type SessionGroup = { label: string; options: string[] };

const SESSION_GROUPS: SessionGroup[] = [
  {
    label: "Certification & Safety",
    options: ["CPR", "Ukeru"],
  },
  {
    label: "Medication",
    options: ["Initial Med Training (4 Days)", "Post Med", "POMs Training"],
  },
  {
    label: "Direct Care & Skills",
    options: ["Mealtime", "Person Centered Thinking", "Van Lyft Training"],
  },
  {
    label: "Onboarding & Development",
    options: ["New Employee Orientation", "Rising Leaders"],
  },
];

const EARLY_REASONS = [
  "Will need to leave early",
  "Arrived late",
  "Could not clock in",
  "Schedule conflict - partial attendance",
  "Other",
];

type Modal = "reminder" | "confirm" | "success" | "clockIn" | null;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowClock(): string {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h}:${m} ${ampm}`;
}

export function KioskSignInForm() {
  const appsScriptUrl =
    process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL?.trim() || APPS_SCRIPT_FALLBACK;

  const [session, setSession] = useState("");
  const [attendee, setAttendee] = useState("");
  const [notes, setNotes] = useState("");
  const [attendanceIssue, setAttendanceIssue] = useState(false);
  const [issueReason, setIssueReason] = useState("");

  const [modal, setModal] = useState<Modal>("reminder");
  const [reminderLock, setReminderLock] = useState(2);
  const [confirmLocked, setConfirmLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [clock, setClock] = useState<string>(nowClock());

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(nowClock()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Reminder countdown — reset on open, tick down each second.
  useEffect(() => {
    if (modal !== "reminder") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReminderLock(2);
    const t = setInterval(() => {
      setReminderLock((n) => {
        if (n <= 1) {
          clearInterval(t);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [modal]);

  // Brief cooldown on the confirm button after it opens.
  useEffect(() => {
    if (modal !== "confirm") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmLocked(true);
    const t = setTimeout(() => setConfirmLocked(false), 800);
    return () => clearTimeout(t);
  }, [modal]);

  // Body scroll lock while any modal is open
  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal]);

  const validate = useCallback(() => {
    if (!session || !attendee.trim()) return "Please pick a training session and enter your name.";
    if (attendanceIssue && !issueReason) return "Please say what happened.";
    return null;
  }, [attendanceIssue, attendee, issueReason, session]);

  function openConfirm() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setModal("confirm");
  }

  function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setModal(null);

    const time = nowClock();
    setSubmittedAt(time);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = appsScriptUrl;
    form.target = "kiosk_submit_frame";
    form.style.display = "none";

    const fields: Record<string, string> = {
      session,
      attendee: attendee.trim(),
      date: todayIso(),
      leftEarly: attendanceIssue ? "Yes" : "No",
      reason: attendanceIssue ? issueReason : "",
      notes: notes.trim(),
    };
    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    // Success fires either on iframe load (most common) or after a hard 5s timeout.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setSubmitting(false);
      setModal("success");
    };
    const onLoad = () => finish();
    iframeRef.current?.addEventListener("load", onLoad, { once: true });
    setTimeout(finish, 5000);
  }

  function resetForm() {
    setSession("");
    setAttendee("");
    setNotes("");
    setAttendanceIssue(false);
    setIssueReason("");
    setError(null);
    setSubmittedAt(null);
    setModal("reminder");
  }

  const detail = useMemo(() => {
    const rows: Array<[string, string]> = [
      ["Name", attendee.trim()],
      ["Training", session],
      ["Time", nowClock()],
    ];
    if (attendanceIssue && issueReason) rows.push(["Issue", issueReason]);
    if (notes.trim()) rows.push(["Notes", notes.trim()]);
    return rows;
  }, [attendanceIssue, attendee, issueReason, notes, session]);

  return (
    <>
      <iframe ref={iframeRef} name="kiosk_submit_frame" title="kiosk submit" className="hidden" />

      <div className="panel p-6 md:p-8">
        <p className="caption">Your arrival time will be recorded as</p>
        <p className="font-display mt-1 text-[40px] leading-none tracking-tight text-[--accent] tabular">
          {clock}
        </p>
        <p className="mt-2 text-xs text-[--ink-muted]">Captured automatically when you submit.</p>
      </div>

      <div className="panel p-6 md:p-8 space-y-5">
        <Field label="Training session">
          <select
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className={selectCls}
          >
            <option value="">Select a training…</option>
            {SESSION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Your full name">
          <input
            value={attendee}
            onChange={(e) => setAttendee(e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
            className={inputCls}
          />
        </Field>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything management should know"
            className={`${inputCls} min-h-[60px] resize-y`}
          />
        </Field>

        <div
          className={`rounded-[var(--radius)] border p-4 transition-colors ${
            attendanceIssue
              ? "border-[--warn]/40 bg-[--warn-soft]"
              : "border-dashed border-[--rule]"
          }`}
        >
          <label className="flex cursor-pointer items-center gap-3 select-none">
            <input
              type="checkbox"
              checked={attendanceIssue}
              onChange={(e) => setAttendanceIssue(e.target.checked)}
              className="h-5 w-5 accent-[--warn]"
            />
            <span className="text-sm font-medium text-[--warn]">
              I have an attendance issue to report
            </span>
          </label>
          {attendanceIssue && (
            <div className="mt-3">
              <Field label="What happened?">
                <select
                  value={issueReason}
                  onChange={(e) => setIssueReason(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select…</option>
                  {EARLY_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-[--alert]/30 bg-[--alert-soft] px-3 py-2 text-sm text-[--alert]"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={openConfirm}
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center rounded-md bg-[--accent] text-base font-semibold text-[--accent-ink] transition-colors hover:bg-[--accent-hover] focus-ring disabled:opacity-60"
        >
          ✎ Sign In
        </button>
      </div>

      {/* ── Reminder modal ── */}
      <Modal open={modal === "reminder"} tone="warn">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[--warn-soft] text-2xl">
          ⚠️
        </div>
        <p className="text-base font-semibold text-[--warn]">
          If you have access to clock in, you must do so to get paid for this training.
        </p>
        <p className="mt-2 text-sm text-[--ink-muted]">
          This form only records your attendance — it does <strong>not</strong> replace clocking in through your timekeeping system.
        </p>
        <button
          onClick={() => setModal(null)}
          disabled={reminderLock > 0}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-[--warn] text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {reminderLock > 0 ? `Please read (${reminderLock}s)` : "I Understand — Continue"}
        </button>
      </Modal>

      {/* ── Confirm modal ── */}
      <Modal open={modal === "confirm"}>
        <Dots step={0} />
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[--accent-soft] text-2xl">
          📋
        </div>
        <h2 className="font-display text-xl text-[--ink]">Confirm your sign-in</h2>
        <p className="mt-1 text-sm text-[--ink-muted]">
          Check this looks correct before submitting.
        </p>
        <dl className="mt-4 rounded-md bg-[--surface-alt] px-4 py-3 text-left text-sm">
          {detail.map(([k, v], i) => (
            <div
              key={k}
              className={`flex items-baseline justify-between gap-3 py-1.5 ${
                i > 0 ? "border-t border-[--rule]/60" : ""
              }`}
            >
              <dt className="caption">{k}</dt>
              <dd className="max-w-[60%] text-right font-medium text-[--ink] break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={submit}
            disabled={confirmLocked || submitting}
            className="inline-flex h-12 items-center justify-center rounded-md bg-[--accent] text-sm font-semibold text-[--accent-ink] transition hover:bg-[--accent-hover] disabled:opacity-60"
          >
            ✓ Submit sign-in
          </button>
          <button
            onClick={() => setModal(null)}
            className="inline-flex h-12 items-center justify-center rounded-md border border-[--rule] bg-[--surface] text-sm font-medium text-[--ink-muted] transition hover:bg-[--surface-alt] hover:text-[--ink]"
          >
            ← Go back & edit
          </button>
        </div>
      </Modal>

      {/* ── Success modal ── */}
      <Modal open={modal === "success"}>
        <Dots step={1} />
        <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[--success-soft] text-3xl">
          ✅
        </div>
        <h2 className="font-display text-2xl text-[--ink]">You&rsquo;re signed in!</h2>
        {submittedAt && (
          <p className="font-display mt-3 text-lg text-[--accent]">
            Arrival recorded at {submittedAt}
          </p>
        )}
        <p className="mt-1 text-sm text-[--ink-muted]">
          {attendee.trim()} signed in for {session}.
        </p>
        <div className="my-5 h-px w-12 mx-auto bg-[--rule]" aria-hidden />
        <p className="text-sm font-medium text-[--ink]">What next?</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => setModal("clockIn")}
            className="inline-flex h-12 items-center justify-center rounded-md bg-[--ink] text-sm font-semibold text-[--bg] transition hover:opacity-90"
          >
            💰 Clock in to get paid
          </button>
          <button
            onClick={resetForm}
            className="inline-flex h-12 items-center justify-center rounded-md border border-[--rule] bg-[--surface] text-sm font-medium text-[--ink-muted] transition hover:bg-[--surface-alt] hover:text-[--ink]"
          >
            ✓ All done
          </button>
        </div>
      </Modal>

      {/* ── Clock-in redirect confirm ── */}
      <Modal open={modal === "clockIn"} tone="warn">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[--warn-soft] text-2xl">
          🔗
        </div>
        <p className="text-base font-semibold text-[--warn]">Opening clock-in system</p>
        <p className="mt-2 text-sm text-[--ink-muted]">
          You&rsquo;ll open <strong>infoservdd.com</strong> in a new tab. This page stays here if you need to come back.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => {
              window.open(CLOCK_IN_URL, "_blank", "noopener,noreferrer");
              setTimeout(resetForm, 600);
            }}
            className="inline-flex h-12 items-center justify-center rounded-md bg-[--ink] text-sm font-semibold text-[--bg] transition hover:opacity-90"
          >
            Open clock-in page →
          </button>
          <button
            onClick={() => setModal("success")}
            className="inline-flex h-12 items-center justify-center rounded-md border border-[--rule] bg-[--surface] text-sm font-medium text-[--ink-muted] transition hover:bg-[--surface-alt] hover:text-[--ink]"
          >
            ← Go back
          </button>
        </div>
      </Modal>
    </>
  );
}

// ─── Primitives ────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-[--rule] bg-[--surface-alt] px-4 py-3 text-base font-medium text-[--ink] placeholder:text-[--ink-muted]/70 focus-ring";
const selectCls = `${inputCls} appearance-none bg-[length:10px_6px] bg-no-repeat pr-9`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="caption">{label}</span>
      {children}
    </label>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="mb-4 flex justify-center gap-1.5">
      {[0, 1].map((i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all ${
            i === step ? "w-6 bg-[--accent]" : "w-2 bg-[--rule]"
          }`}
        />
      ))}
    </div>
  );
}

function Modal({
  open,
  tone = "default",
  children,
}: {
  open: boolean;
  tone?: "default" | "warn";
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[--ink]/40 p-4 backdrop-blur"
    >
      <div
        className={`panel w-full max-w-md p-6 text-center md:p-8 ${
          tone === "warn" ? "border-[--warn]/40" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
