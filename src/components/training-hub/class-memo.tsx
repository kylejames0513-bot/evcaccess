"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export function ClassMemo({
  preview,
  plainText,
  rosterEmpty,
  templateName,
}: {
  preview: string;
  plainText: string;
  rosterEmpty: boolean;
  templateName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (rosterEmpty) return;
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      toast.success("Memo copied — paste it anywhere.");
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      toast.error("Couldn't copy to clipboard.");
      console.error(err);
    }
  }

  return (
    <div className="space-y-3">
      <div className="panel p-0">
        <pre className="m-0 max-h-[460px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[--surface-alt] p-5 text-[13px] leading-relaxed text-[--ink]">
          {rosterEmpty
            ? "Add attendees to the roster, then the memo preview will appear here."
            : preview}
        </pre>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[--ink-muted]">
          Template:{" "}
          <span className="italic">{templateName}</span>
          {" · "}
          <Link href="/settings/memos" className="text-[--accent] hover:underline">
            Edit template
          </Link>
        </div>

        <button
          type="button"
          onClick={copy}
          disabled={rosterEmpty}
          className="inline-flex h-10 items-center rounded-md bg-[--accent] px-4 text-sm font-medium text-[--primary-foreground] transition hover:opacity-90 disabled:opacity-40 focus-ring"
        >
          {copied ? "Copied ✓" : "Copy memo"}
        </button>
      </div>

      {rosterEmpty && (
        <p className="text-xs text-[--ink-muted]">
          The memo unlocks once the roster has at least one attendee.
        </p>
      )}
    </div>
  );
}
