"use client";

import { useState } from "react";

/**
 * /signin
 *
 * Public sign-in form. Replaces the legacy Google Form. No auth.
 * Submits to /api/signin which runs the resolver and immediately
 * commits the row.
 */
export default function PublicSigninPage() {
  const [name, setName] = useState("");
  const [training, setTraining] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeName: name,
          trainingSession: training,
          dateOfTraining: date,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setResult({ ok: false, message: j.error || "Submission failed" });
      } else {
        setResult({ ok: true, message: j.message ?? "Submitted." });
        if (j.added > 0) {
          setName("");
          setTraining("");
        }
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">Training sign in</h1>
        <p className="text-gray-600 mb-6">Sign in for the training you are attending today.</p>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Your full name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded border-gray-300 px-3 py-2"
              placeholder="Last, First or First Last"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Training</span>
            <input
              type="text"
              required
              value={training}
              onChange={(e) => setTraining(e.target.value)}
              className="mt-1 block w-full rounded border-gray-300 px-3 py-2"
              placeholder="e.g. CPR/FA"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded border-gray-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Sign in"}
          </button>
        </form>

        {result && (
          <div
            className={`mt-4 p-3 rounded text-sm ${
              result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
