"use client";

import { useEffect, useState } from "react";
import { X, Copy, Download, Mail, Check, Loader2 } from "lucide-react";

interface ClassMemoModalProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

interface MemoPayload {
  session: {
    id: string;
    training_name: string;
    session_date: string;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
  };
  attendee_count: number;
  manager_count: number;
  memo_text: string;
  attendees_by_department: Record<
    string,
    Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      position: string | null;
      job_title: string | null;
    }>
  >;
  managers_by_department: Record<
    string,
    Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      job_title: string | null;
    }>
  >;
}

/**
 * Modal shown when HR clicks "Create class memo" on a session. Fetches
 * the memo payload from /api/sessions/[id]/memo, renders a preview,
 * and offers Copy-to-clipboard, Download-as-.txt, and Open-in-email-
 * client actions. Does NOT actually send email.
 */
export default function ClassMemoModal({
  sessionId,
  open,
  onClose,
}: ClassMemoModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<MemoPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [editedText, setEditedText] = useState("");

  useEffect(() => {
    if (!open) {
      setMemo(null);
      setError(null);
      setCopied(false);
      setEditedText("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/memo`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error ?? "Failed to build memo");
        setMemo(j);
        setEditedText(j.memo_text);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to build memo");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, open]);

  if (!open) return null;

  async function copyToClipboard() {
    if (!editedText) return;
    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the text manually and copy.");
    }
  }

  function download() {
    if (!editedText || !memo) return;
    const blob = new Blob([editedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `class-memo-${memo.session.session_date}-${slug(
      memo.session.training_name
    )}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function openInMail() {
    if (!memo) return;
    const subject = `Class Memo — ${memo.session.training_name} (${memo.session.session_date})`;
    // Collect both attendee and manager emails (dedup by email) so the
    // memo lands directly in the inboxes of everyone involved — HR
    // doesn't need to forward it through managers.
    const emails = new Set<string>();
    for (const list of Object.values(memo.attendees_by_department)) {
      for (const a of list) {
        if (a.email) emails.add(a.email);
      }
    }
    for (const list of Object.values(memo.managers_by_department)) {
      for (const m of list) {
        if (m.email) emails.add(m.email);
      }
    }
    const to = Array.from(emails).join(",");
    const href = `mailto:${to}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(editedText)}`;
    window.location.href = href;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Class memo</h2>
            {memo && (
              <p className="text-xs text-slate-500 mt-0.5">
                {memo.session.training_name} ·{" "}
                {memo.session.session_date} · {memo.attendee_count} attendees ·{" "}
                {memo.manager_count} managers
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Building memo…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          {!loading && !error && memo && (
            <>
              <p className="text-xs text-slate-500 mb-2">
                Edit the draft below, then copy or download. This tool
                does not actually send email — it opens a pre-filled
                draft in your mail client, or you can copy the text and
                paste it into Outlook.
              </p>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[400px] font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {memo.manager_count === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  No managers were auto-identified for the attendees&apos;
                  departments. You&apos;ll need to add recipients manually in
                  your email client.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer / actions */}
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!memo || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download .txt
          </button>
          <button
            type="button"
            onClick={openInMail}
            disabled={!memo || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            Open in email
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!memo || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy to clipboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
