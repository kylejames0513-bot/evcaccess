"use client";

import { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle, Send, ArrowLeft, ChevronDown } from "lucide-react";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxZ8CQOcwuCSLrLwAP0MVsozi03uE6korbvfENrNgGRA_cs9Pgp-1tptRQGLz69GUXFA/exec";

const TRAINING_OPTIONS = [
  { group: "Certification & Safety", options: ["CPR", "Ukeru"] },
  { group: "Medication", options: ["Initial Med Training (4 Days)", "Post Med", "POMs Training"] },
  { group: "Direct Care & Skills", options: ["Mealtime", "Person Centered Thinking", "Van Lyft Training"] },
  { group: "Onboarding & Development", options: ["New Employee Orientation", "Rising Leaders"] },
];

const ISSUE_REASONS = [
  "Will need to leave early",
  "Arrived late",
  "Could not clock in",
  "Schedule conflict - partial attendance",
  "Other (explain in notes)",
];

type Step = "reminder" | "form" | "confirm" | "submitting" | "success";

export default function SignInPage() {
  const [step, setStep] = useState<Step>("reminder");
  const [clock, setClock] = useState("");
  const [session, setSession] = useState("");
  const [attendee, setAttendee] = useState("");
  const [notes, setNotes] = useState("");
  const [hasIssue, setHasIssue] = useState(false);
  const [issueReason, setIssueReason] = useState("");
  const [error, setError] = useState("");
  const [submitTime, setSubmitTime] = useState("");
  const [reminderCountdown, setReminderCountdown] = useState(3);

  // Clock
  useEffect(() => {
    function tick() {
      const now = new Date();
      let h = now.getHours();
      const m = now.getMinutes().toString().padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      h = h === 0 ? 12 : h > 12 ? h - 12 : h;
      setClock(`${h}:${m} ${ampm}`);
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  // Reminder countdown
  useEffect(() => {
    if (step !== "reminder") return;
    setReminderCountdown(3);
    const id = setInterval(() => {
      setReminderCountdown((c) => {
        if (c <= 1) { clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  function handleSubmit() {
    setError("");
    if (!session) { setError("Please select a training session."); return; }
    if (!attendee.trim()) { setError("Please enter your name."); return; }
    if (hasIssue && !issueReason) { setError("Please select what happened."); return; }
    setStep("confirm");
  }

  async function doSubmit() {
    setStep("submitting");
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = `${h}:${m} ${ampm}`;
    setSubmitTime(timeStr);

    const d = now;
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;

    // Submit via fetch (no-cors) to avoid blocking the main thread
    const params = new URLSearchParams({
      session,
      attendee: attendee.trim(),
      date: dateStr,
      leftEarly: hasIssue ? "Yes" : "No",
      reason: hasIssue ? issueReason : "",
      notes: notes.trim(),
    });

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } catch {
      // no-cors won't give us a readable response, but the request still goes through
    }

    setStep("success");
  }

  function resetForm() {
    setSession("");
    setAttendee("");
    setNotes("");
    setHasIssue(false);
    setIssueReason("");
    setError("");
    setStep("reminder");
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Back link — only for HR navigating */}
        <a href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to Hub
        </a>

        {/* ── Reminder Overlay ── */}
        {step === "reminder" && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-lg p-8 text-center animate-in">
            <div className="w-14 h-14 bg-amber-50 border-2 border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-amber-800 leading-snug">
              If you have access to clock in, you must do so in order to get paid for this training.
            </h2>
            <p className="text-sm text-slate-500 mt-3 leading-relaxed">
              This form only records your attendance — it does <strong>not</strong> replace clocking in through your timekeeping system.
            </p>
            <button
              onClick={() => setStep("form")}
              disabled={reminderCountdown > 0}
              className="w-full mt-6 px-6 py-3.5 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reminderCountdown > 0 ? `Please read (${reminderCountdown}s)` : "I Understand — Continue"}
            </button>
          </div>
        )}

        {/* ── Sign In Form ── */}
        {step === "form" && (
          <div className="space-y-4">
            {/* Clock */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Your arrival time</p>
              <p className="text-3xl font-bold text-[#1e3a5f] mt-1 font-serif">{clock}</p>
              <p className="text-xs text-slate-400 mt-1">Captured when you submit</p>
            </div>

            {/* Form */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Send className="h-5 w-5 text-[#1e3a5f]" /> Sign In
              </h2>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Training Session</label>
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:bg-white"
                >
                  <option value="">Select a training...</option>
                  {TRAINING_OPTIONS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Your Full Name</label>
                <input
                  type="text"
                  value={attendee}
                  onChange={(e) => setAttendee(e.target.value)}
                  placeholder="First and last name"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything management should know"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:bg-white resize-none"
                />
              </div>

              {/* Attendance issue */}
              <div className={`border rounded-xl p-4 transition-colors ${hasIssue ? "border-amber-300 bg-amber-50/50" : "border-dashed border-slate-200"}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasIssue}
                    onChange={(e) => { setHasIssue(e.target.checked); if (!e.target.checked) setIssueReason(""); }}
                    className="w-5 h-5 accent-amber-500 rounded"
                  />
                  <span className="text-sm font-semibold text-amber-700">I have an attendance issue to report</span>
                </label>
                {hasIssue && (
                  <div className="mt-3">
                    <select
                      value={issueReason}
                      onChange={(e) => setIssueReason(e.target.value)}
                      className="w-full px-4 py-3 border border-amber-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">Select...</option>
                      {ISSUE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                className="w-full px-6 py-3.5 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#2a4d7a] transition-all shadow-md"
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* ── Confirm ── */}
        {step === "confirm" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 text-center">
            <div className="w-14 h-14 bg-blue-50 border-2 border-blue-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="h-6 w-6 text-[#1e3a5f]" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Confirm Your Sign In</h2>
            <p className="text-sm text-slate-500 mt-1">Please verify this looks correct.</p>

            <div className="bg-slate-50 rounded-xl p-4 mt-5 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 text-xs font-bold uppercase">Name</span>
                <span className="font-medium text-slate-900">{attendee}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                <span className="text-slate-400 text-xs font-bold uppercase">Training</span>
                <span className="font-medium text-slate-900">{session}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                <span className="text-slate-400 text-xs font-bold uppercase">Time</span>
                <span className="font-medium text-slate-900">{clock}</span>
              </div>
              {hasIssue && (
                <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                  <span className="text-slate-400 text-xs font-bold uppercase">Issue</span>
                  <span className="font-medium text-amber-700">{issueReason}</span>
                </div>
              )}
              {notes && (
                <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                  <span className="text-slate-400 text-xs font-bold uppercase">Notes</span>
                  <span className="font-medium text-slate-900 text-right max-w-[60%]">{notes}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 mt-6">
              <button
                onClick={doSubmit}
                className="w-full px-6 py-3.5 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#2a4d7a] transition-all"
              >
                Submit Sign In
              </button>
              <button
                onClick={() => setStep("form")}
                className="w-full px-6 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50"
              >
                Go Back & Edit
              </button>
            </div>
          </div>
        )}

        {/* ── Submitting ── */}
        {step === "submitting" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Clock className="h-6 w-6 text-[#1e3a5f]" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Recording your arrival...</h2>
            <p className="text-sm text-slate-400 mt-2">Please wait a moment.</p>
          </div>
        )}

        {/* ── Success ── */}
        {step === "success" && (
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">You&apos;re Signed In!</h2>
            <p className="text-lg text-emerald-600 font-semibold mt-2">Arrival recorded at {submitTime}</p>
            <p className="text-sm text-slate-500 mt-1">{attendee} signed in for {session}</p>

            <div className="w-12 h-0.5 bg-slate-200 mx-auto my-6 rounded" />

            <p className="text-sm font-semibold text-slate-700 mb-4">What would you like to do next?</p>

            <div className="space-y-3">
              <a
                href="https://infoservdd.com/login/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-6 py-3.5 bg-[#0f172a] text-white font-semibold rounded-xl hover:bg-[#1e293b] transition-all flex items-center justify-center gap-2"
              >
                Clock In to Get Paid
              </a>
              <button
                onClick={resetForm}
                className="w-full px-6 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50"
              >
                All Done — Next Person
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
