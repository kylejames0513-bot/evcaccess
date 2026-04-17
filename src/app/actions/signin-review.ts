"use server";

import { revalidatePath } from "next/cache";

export type PendingSignIn = {
  id: string;
  arrivalTime: string;
  session: string;
  attendee: string;
  date: string;
  leftEarly: string;
  reason: string;
  notes: string;
};

function appsScriptUrl(): string {
  return (
    process.env.GOOGLE_APPS_SCRIPT_URL?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL?.trim() ||
    "https://script.google.com/macros/s/AKfycbwOJQvaCIEiRJu8mTZicVvqpTtwWfY6LeWEXyTH0j5X9W55y9-fFs-GN2WbulrpcB1ocg/exec"
  );
}

export async function listPendingSignIns(): Promise<{
  signIns: PendingSignIn[];
  error?: string;
}> {
  try {
    const base = appsScriptUrl();
    const url = `${base}?action=listPendingSignIns&ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!res.ok) {
      return { signIns: [], error: `Apps Script returned ${res.status}` };
    }
    const json = (await res.json()) as { ok?: boolean; signIns?: PendingSignIn[]; error?: string };
    if (!json.ok) return { signIns: [], error: json.error ?? "Apps Script reported not OK" };
    return { signIns: json.signIns ?? [] };
  } catch (e) {
    return { signIns: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveKioskSignInAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id) return;
  if (result !== "Pass" && result !== "Failed") return;

  const base = appsScriptUrl();
  await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolveSignIn", id, result, notes: notes || undefined }),
    cache: "no-store",
    redirect: "follow",
  });

  revalidatePath("/signin-queue");
}
