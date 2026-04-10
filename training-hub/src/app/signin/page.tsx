"use client";

import { useEffect, useState } from "react";

interface TrainingOption {
  id: number;
  name: string;
  category: string;
}

function categorize(name: string): string {
  const lower = name.toLowerCase();
  if (["cpr/fa", "first aid"].some(k => lower.includes(k))) return "Safety & Medical";
  if (["med recert", "initial med", "post med", "mealtime"].some(k => lower.includes(k))) return "Medical";
  if (["ukeru", "safety care", "cpi"].some(k => lower.includes(k))) return "Behavioral";
  if (["orientation", "relias", "job description", "manager"].some(k => lower.includes(k))) return "Onboarding";
  return "Other";
}

const CATEGORY_ORDER = ["Safety & Medical", "Medical", "Behavioral", "Onboarding", "Other"];

const CLOCK_IN_URL = "https://infoservdd.com/login/";

export default function PublicSigninPage() {
  const [trainings, setTrainings] = useState<TrainingOption[]>([]);
  const [training, setTraining] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [hasIssue, setHasIssue] = useState(false);
  const [issueReason, setIssueReason] = useState("");
  const [clock, setClock] = useState("");
  const [step, setStep] = useState<"reminder" | "form" | "confirm" | "success" | "error">("reminder");
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [countdown, setCountdown] = useState(3);

  // Load training catalog dynamically
  useEffect(() => {
    fetch("/api/training-types")
      .then(r => r.json())
      .then(j => {
        const types = (j.training_types ?? [])
          .filter((t: { is_active: boolean }) => t.is_active)
          .map((t: { id: number; name: string }) => ({
            id: t.id,
            name: t.name,
            category: categorize(t.name),
          }));
        setTrainings(types);
      })
      .catch(() => {});
  }, []);

  // Live clock
  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  // Reminder countdown
  useEffect(() => {
    if (step !== "reminder") return;
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [step, countdown]);

  // Group trainings by category
  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, items: trainings.filter(t => t.category === cat) }))
    .filter(g => g.items.length > 0);

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setArrivalTime(new Date().toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
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
          notes: [
            notes,
            hasIssue && issueReason ? `Attendance issue: ${issueReason}` : "",
          ].filter(Boolean).join(". ") || null,
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
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 50%, #40916c 100%)" }}>
      {/* Header */}
      <header className="text-center pt-6 pb-3 px-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">EVC Training Sign In</h1>
        <p className="text-green-200 text-sm">Emory Valley Center</p>
        <div className="mt-2 inline-block bg-white/20 rounded-full px-4 py-1">
          <span className="text-white text-lg font-mono">{clock}</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">

          {/* Reminder overlay */}
          {step === "reminder" && (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-800">Reminder</h2>
              <p className="text-gray-600">You <strong>must clock in</strong> on InfoServ to get paid for this training.</p>
              <p className="text-sm text-gray-500">Sign in here first, then clock in when prompted.</p>
              <button
                type="button"
                onClick={() => setStep("form")}
                disabled={countdown > 0}
                className="mt-4 w-full py-3 rounded-xl text-white font-bold text-lg transition-all disabled:opacity-50"
                style={{ background: countdown > 0 ? "#888" : "linear-gradient(135deg, #2d6a4f, #40916c)" }}
              >
                {countdown > 0 ? `I understand (${countdown})` : "I understand, continue"}
              </button>
            </div>
          )}

          {/* Form */}
          {step === "form" && (
            <form onSubmit={handleReview} className="p-6 sm:p-8 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Training Session</label>
                <select
                  required
                  value={training}
                  onChange={(e) => setTraining(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Select training...</option>
                  {grouped.map(g => (
                    <optgroup key={g.cat} label={g.cat}>
                      {g.items.sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First Last"
                  autoComplete="name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes <span className="font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                  placeholder="Optional..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="hasIssue" checked={hasIssue}
                  onChange={(e) => setHasIssue(e.target.checked)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                <label htmlFor="hasIssue" className="text-sm text-gray-700">I have an attendance issue to report</label>
              </div>

              {hasIssue && (
                <div className="pl-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">What happened?</label>
                  <select value={issueReason} onChange={(e) => setIssueReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                    <option value="">Select...</option>
                    <option value="Arrived late">Arrived late</option>
                    <option value="Need to leave early">Need to leave early</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              <button type="submit"
                className="w-full py-3 rounded-xl text-white font-bold text-lg shadow-lg transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}>
                Sign In
              </button>
            </form>
          )}

          {/* Confirm */}
          {step === "confirm" && (
            <div className="p-6 sm:p-8 space-y-4">
              <h2 className="text-xl font-bold text-gray-800 text-center">Confirm your details</h2>
              <div className="bg-green-50 rounded-xl p-4 space-y-2 text-sm">
                <Row label="Name" value={name} />
                <Row label="Training" value={training} />
                <Row label="Arrival" value={arrivalTime} />
                {notes && <Row label="Notes" value={notes} />}
                {hasIssue && issueReason && <Row label="Issue" value={issueReason} />}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep("form")}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold">
                  Go back
                </button>
                <button type="button" onClick={handleConfirm} disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold shadow-lg disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}>
                  {submitting ? "Recording..." : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="p-6 sm:p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-green-800">Arrival recorded at {arrivalTime}</h2>
              <p className="text-sm text-gray-600">{resultMessage}</p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
                <p className="text-sm font-semibold text-amber-800 mb-2">You must clock in to get paid for this training.</p>
                <a
                  href={CLOCK_IN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 rounded-xl text-white font-bold text-lg text-center shadow-lg"
                  style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}
                >
                  Clock In to Get Paid
                </a>
              </div>

              <button type="button" onClick={reset}
                className="w-full py-2.5 rounded-xl border-2 border-green-600 text-green-700 font-bold mt-2">
                All Done / Next Person
              </button>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="p-6 sm:p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-red-800">Something went wrong</h2>
              <p className="text-sm text-gray-600">{resultMessage}</p>
              <button type="button" onClick={() => setStep("form")}
                className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold">
                Try again
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center pb-4 px-4">
        <p className="text-green-200/50 text-xs">Emory Valley Center Training Hub</p>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="font-semibold text-gray-600">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}
