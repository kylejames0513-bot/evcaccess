"use client";

import { useState } from "react";

const SESSIONS = [
  "CPR",
  "Ukeru",
  "Mealtime",
  "Initial Med Training (4 Days)",
  "Med Recert",
  "Post Med",
  "POMs Training",
  "Person Centered Thinking",
  "Van Lyft Training",
  "Safety Care",
  "Meaningful Day",
  "Rights Training",
  "Title VI",
  "Active Shooter",
];

export function KioskSignInForm({ orgSlug }: { orgSlug: string }) {
  const [name, setName] = useState("");
  const [session, setSession] = useState(SESSIONS[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ employee?: string; resolved?: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !session) return;
    setMessage(null);
    setPending(true);

    try {
      const res = await fetch("/api/public/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_name: name.trim(),
          session,
          date: new Date().toISOString().slice(0, 10),
          device_info: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Could not save your sign-in.");
        setPending(false);
        return;
      }
      setResult(json);
      setDone(true);
    } catch {
      setMessage("Network error. Please try again.");
    }
    setPending(false);
  }

  function reset() {
    setDone(false);
    setResult(null);
    setName("");
    setMessage(null);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[--rule] bg-[--surface] p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h2 className="font-display text-xl font-medium">
          Signed in{result?.employee ? ` as ${result.employee}` : ""}
        </h2>
        <p className="text-sm text-[--ink-muted]">
          {result?.resolved
            ? `Your attendance for ${session} has been recorded.`
            : "Your name will be matched to the roster by HR."}
        </p>
        <button
          onClick={reset}
          className="rounded-md border border-[--rule] bg-[--surface-alt] px-6 py-2 text-sm font-medium hover:bg-[--surface]"
        >
          Sign in another person
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-[--rule] bg-[--surface] p-8">
      <div className="space-y-2">
        <label htmlFor="session" className="caption block">Training session</label>
        <select
          id="session"
          value={session}
          onChange={(e) => setSession(e.target.value)}
          className="flex h-12 w-full rounded-md border border-[--rule] bg-[--bg] px-3 text-base"
        >
          {SESSIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="name" className="caption block">Your name (first and last)</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          placeholder="John Smith"
          className="flex h-12 w-full rounded-md border border-[--rule] bg-[--bg] px-3 text-base"
        />
      </div>
      {message && <p className="text-sm text-[--alert]">{message}</p>}
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="h-12 w-full rounded-md bg-[--accent] text-base font-medium text-[--primary-foreground] hover:bg-[--accent]/90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
