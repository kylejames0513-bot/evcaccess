"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function KioskSignInForm({
  orgSlug,
  classes,
}: {
  orgSlug: string;
  classes: { id: string; scheduled_date: string }[];
}) {
  const [rawName, setRawName] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/public/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_slug: orgSlug,
        raw_name: rawName,
        class_id: classId || null,
        raw_training: "",
        device_info: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "We could not save your sign in.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[#2a2e3d] bg-[#1a1d27] p-8 text-center">
        <p className="text-lg font-medium">Thanks, you are signed in.</p>
        <p className="mt-2 text-sm text-[#8b8fa3]">
          If something looks wrong, ask the coordinator to fix the roster.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-xl border border-[#2a2e3d] bg-[#1a1d27] p-8"
    >
      <div className="space-y-2">
        <Label htmlFor="class">Class today</Label>
        <select
          id="class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="flex h-12 w-full rounded-lg border border-[#2a2e3d] bg-[#0f1117] px-3 text-base text-[#e8eaed]"
        >
          {classes.length ? (
            classes.map((c) => (
              <option key={c.id} value={c.id}>
                Session {c.scheduled_date}
              </option>
            ))
          ) : (
            <option value="">No class listed for today</option>
          )}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          value={rawName}
          onChange={(e) => setRawName(e.target.value)}
          required
          autoComplete="name"
          className="h-12 border-[#2a2e3d] bg-[#0f1117] text-base"
          placeholder="First and last name"
        />
      </div>
      {message ? <p className="text-sm text-[#ef4444]">{message}</p> : null}
      <Button type="submit" className="h-12 w-full rounded-lg bg-[#3b82f6] text-base text-white hover:bg-[#2563eb]">
        Submit sign in
      </Button>
    </form>
  );
}
