"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveMemoSignoffAction } from "@/app/actions/memo-template";

export function MemoSignoffForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [isPending, start] = useTransition();
  const router = useRouter();

  function submit() {
    const form = new FormData();
    form.set("memo_signoff", value);
    start(async () => {
      await saveMemoSignoffAction(form);
      toast.success("Signoff saved.");
      router.refresh();
    });
  }

  return (
    <div className="panel space-y-3 p-5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"Kyle Mahoney\nHR Program Coordinator · Emory Valley Center"}
        rows={3}
        className="input resize-none font-mono text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={isPending || value === initial}
          onClick={submit}
          className="inline-flex h-9 items-center rounded-md bg-[--accent] px-3 text-sm font-medium text-[--primary-foreground] transition hover:opacity-90 disabled:opacity-40 focus-ring"
        >
          {isPending ? "Saving…" : "Save signoff"}
        </button>
      </div>
    </div>
  );
}
