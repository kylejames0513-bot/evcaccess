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
  const [dateStr, setDateStr] = useState("");
  const [step, setStep] = useState<"reminder" | "form" | "confirm" | "success" | "error">("reminder");
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    fetch("/api/training-types")
      .then(r => r.json())
      .then(j => {
        const types = (j.training_types ?? [])
          .filter((t: { is_active: boolean }) => t.is_active)
          .map((t: { id: number; name: string }) => ({
            id: t.id, name: t.name, category: categorize(t.name),
          }));
        setTrainings(types);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      setDateStr(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (step !== "reminder" || countdown <= 0) return;
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [step, countdown]);

  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, items: trainings.filter(t => t.category === cat) }))
    .filter(g => g.items.length > 0);

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
          notes: [notes, hasIssue && issueReason ? `Attendance issue: ${issueReason}` : ""].filter(Boolean).join(". ") || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setResultMessage(j.error || "Submission failed"); setStep("error"); }
      else { setResultMessage(j.message ?? "Arrival recorded."); setStep("success"); }
    } catch (err) {
      setResultMessage(err instanceof Error ? err.message : "Network error");
      setStep("error");
    } finally { setSubmitting(false); }
  }

  function reset() {
    setName(""); setTraining(""); setNotes(""); setHasIssue(false);
    setIssueReason(""); setStep("form"); setResultMessage("");
  }

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "linear-gradient(160deg, #081c15 0%, #1b4332 40%, #2d6a4f 100%)" }}>
      {/* Header */}
      <header className="shrink-0 text-center pt-safe-top px-4 pt-5 pb-3 sm:pt-8 sm:pb-4">
        <div className="flex items-center justify-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <svg className="h-6 w-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
            </svg>
          </div>
          <div className="text-left">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">Training Sign In</h1>
            <p className="text-emerald-300/70 text-xs sm:text-sm">Emory Valley Center</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-3">
          <span className="bg-white/10 backdrop-blur rounded-full px-3 py-1 text-white text-sm font-mono">{clock}</span>
          <span className="text-emerald-200/50 text-xs hidden sm:inline">{dateStr}</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-3 sm:px-4 pb-6 pt-2">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

          {/* Reminder */}
          {step === "reminder" && (
            <div className="p-6 sm:p-8 text-center space-y-5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto ring-4 ring-amber-100">
                <svg className="h-7 w-7 sm:h-8 sm:w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">Before you sign in</h2>
                <p className="text-gray-600 mt-2 text-sm leading-relaxed">You <strong className="text-amber-700">must clock in on InfoServ</strong> to get paid for this training. Sign in here first, then clock in when prompted.</p>
              </div>
              <button type="button" onClick={() => setStep("form")} disabled={countdown > 0}
                className="w-full py-3.5 rounded-xl text-white font-bold text-base transition-all disabled:opacity-40"
                style={{ background: countdown > 0 ? "#9ca3af" : "linear-gradient(135deg, #2d6a4f, #40916c)" }}>
                {countdown > 0 ? `I understand (${countdown})` : "I understand"}
              </button>
            </div>
          )}

          {/* Form */}
          {step === "form" && (
            <form onSubmit={handleReview} className="p-5 sm:p-7 space-y-4">
              <Field label="Training Session">
                <select required value={training} onChange={(e) => setTraining(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-colors">
                  <option value="">Select training...</option>
                  {grouped.map(g => (
                    <optgroup key={g.cat} label={`--- ${g.cat} ---`}>
                      {g.items.sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>

              <Field label="Your Full Name">
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="First Last" autoComplete="name" autoCapitalize="words"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-colors" />
              </Field>

              <Field label="Notes" optional>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-colors resize-none"
                  placeholder="Optional..." />
              </Field>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={hasIssue} onChange={(e) => setHasIssue(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                <span className="text-sm text-gray-700">Report an attendance issue</span>
              </label>

              {hasIssue && (
                <div className="ml-7">
                  <select value={issueReason} onChange={(e) => setIssueReason(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white">
                    <option value="">What happened?</option>
                    <option value="Arrived late">Arrived late</option>
                    <option value="Need to leave early">Need to leave early</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              <button type="submit"
                className="w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg shadow-emerald-900/20 transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}>
                Sign In
              </button>
            </form>
          )}

          {/* Confirm */}
          {step === "confirm" && (
            <div className="p-5 sm:p-7 space-y-4">
              <h2 className="text-lg font-bold text-gray-800 text-center">Confirm your details</h2>
              <div className="bg-emerald-50 rounded-xl p-4 space-y-2.5 text-sm border border-emerald-100">
                <ConfirmRow label="Name" value={name} />
                <ConfirmRow label="Training" value={training} />
                <ConfirmRow label="Arrival" value={arrivalTime} />
                {notes && <ConfirmRow label="Notes" value={notes} />}
                {hasIssue && issueReason && <ConfirmRow label="Issue" value={issueReason} />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setStep("form")}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm">
                  Go back
                </button>
                <button type="button" onClick={handleConfirm} disabled={submitting}
                  className="py-3 rounded-xl text-white font-bold text-sm shadow-lg disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2d6a4f, #40916c)" }}>
                  {submitting ? "Recording..." : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="p-5 sm:p-7 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto ring-4 ring-emerald-50">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-emerald-800">Arrival recorded</h2>
                <p className="text-emerald-600 font-mono text-sm mt-0.5">{arrivalTime}</p>
              </div>
              <p className="text-sm text-gray-500">{resultMessage}</p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">Clock in on InfoServ to get paid.</p>
                <a href={CLOCK_IN_URL} target="_blank" rel="noopener noreferrer"
                  className="block w-full py-3 rounded-xl text-white font-bold text-base text-center shadow-lg transition-transform active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}>
                  Clock In to Get Paid
                </a>
              </div>

              <button type="button" onClick={reset}
                className="w-full py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 font-bold text-sm transition-colors hover:bg-emerald-50">
                All Done / Next Person
              </button>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="p-5 sm:p-7 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto ring-4 ring-red-50">
                <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-red-800">Something went wrong</h2>
              <p className="text-sm text-gray-600">{resultMessage}</p>
              <button type="button" onClick={() => setStep("form")}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm">
                Try again
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 text-center pb-safe-bottom pb-3 px-4">
        <p className="text-emerald-300/30 text-[10px]">Emory Valley Center Training Hub</p>
      </footer>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}{optional && <span className="font-normal text-gray-400 ml-1">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="font-medium text-emerald-700 shrink-0">{label}</span>
      <span className="text-gray-800 text-right">{value}</span>
    </div>
  );
}
