"use client";

import { useEffect, useState } from "react";

const TRAINING_OPTIONS = [
  "CPR/FA",
  "Ukeru",
  "Mealtime",
  "Med Recert",
  "Initial Med Training",
  "Post Med",
  "Safety Care",
  "Person Centered",
  "Meaningful Day",
  "Orientation",
  "Manager Training",
  "Rights Training",
  "Active Shooter",
  "Relias",
  "Job Description",
  "Other",
];

/**
 * /signin
 *
 * Public training sign-in page. Styled to match the existing EVC
 * sign-in form at emoryvalleycenter.github.io/evctraining/. Green
 * color scheme, card layout, dropdown for training, live clock,
 * attendance issue toggle, confirmation step.
 */
export default function PublicSigninPage() {
  const [name, setName] = useState("");
  const [training, setTraining] = useState("");
  const [notes, setNotes] = useState("");
  const [hasIssue, setHasIssue] = useState(false);
  const [issueReason, setIssueReason] = useState("");
  const [clock, setClock] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "success" | "error">("form");
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");

  useEffect(() => {
    function tick() {
      setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setArrivalTime(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setStep("confirm");
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const r = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeName: name,
          trainingSession: training,
          dateOfTraining: new Date().toISOString().slice(0, 10),
          notes: [notes, hasIssue ? `Attendance issue: ${issueReason}` : ""].filter(Boolean).join(". ") || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setResultMessage(j.error || "Submission failed");
        setStep("error");
      } else {
        setResultMessage(j.message ?? "Arrival recorded.");
        setStep("success");
      }
    } catch (err) {
      setResultMessage(err instanceof Error ? err.message : "Network error");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setName("");
    setTraining("");
    setNotes("");
    setHasIssue(false);
    setIssueReason("");
    setStep("form");
    setResultMessage("");
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 50%, #40916c 100%)" }}>
      {/* Header */}
      <header className="text-center pt-8 pb-4 px-4">
        <h1 className="text-3xl font-bold text-white tracking-tight">EVC Training Sign In</h1>
        <p className="text-green-200 mt-1 text-sm">Emory Valley Center</p>
        <div className="mt-3 inline-block bg-white/20 rounded-full px-4 py-1">
          <span className="text-white text-lg font-mono">{clock}</span>
        </div>
      </header>

      <main className="flex items-start justify-center px-4 pb-12">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-lg w-full mt-4">

          {step === "form" && (
            <form onSubmit={handleReview} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Training Session</label>
                <select
                  required
                  value={training}
                  onChange={(e) => setTraining(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Select training...</option>
                  {TRAINING_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First Last"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasIssue"
                  checked={hasIssue}
                  onChange={(e) => setHasIssue(e.target.checked)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="hasIssue" className="text-sm text-gray-700">I have an attendance issue to report</label>
              </div>

              {hasIssue && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">What happened?</label>
                  <select
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">Select reason...</option>
                    <option value="Arrived late">Arrived late</option>
                    <option value="Leaving early">Leaving early</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl text-white font-bold text-lg transition-all shadow-lg"
                style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}
              >
                Sign In
              </button>
            </form>
          )}

          {step === "confirm" && (
            <div className="text-center space-y-4">
              <h2 className="text-xl font-bold text-gray-800">Confirm your details</h2>
              <div className="bg-green-50 rounded-xl p-4 text-left space-y-2 text-sm">
                <div><span className="font-semibold text-gray-600">Name:</span> {name}</div>
                <div><span className="font-semibold text-gray-600">Training:</span> {training}</div>
                <div><span className="font-semibold text-gray-600">Arrival time:</span> {arrivalTime}</div>
                {notes && <div><span className="font-semibold text-gray-600">Notes:</span> {notes}</div>}
                {hasIssue && issueReason && <div><span className="font-semibold text-gray-600">Issue:</span> {issueReason}</div>}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold shadow-lg disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}
                >
                  {submitting ? "Submitting..." : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-green-800">Arrival recorded at {arrivalTime}</h2>
              <p className="text-sm text-gray-600">{resultMessage}</p>
              <p className="text-xs text-gray-500 mt-2">Remember: you must clock in to get paid for this training.</p>
              <button
                type="button"
                onClick={reset}
                className="mt-4 w-full py-2.5 rounded-xl text-white font-bold"
                style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}
              >
                Next person
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-red-800">Something went wrong</h2>
              <p className="text-sm text-gray-600">{resultMessage}</p>
              <button
                type="button"
                onClick={() => setStep("form")}
                className="mt-4 w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
