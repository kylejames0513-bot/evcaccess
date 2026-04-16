import { NextResponse } from "next/server";

/**
 * Diagnostic endpoint — reports which Supabase env vars are set and whether
 * the anon key can reach the project. Hit /api/debug/env-check to diagnose
 * "Invalid API key" errors. Remove this route before going to production.
 */
export async function GET() {
  const vars: Record<string, string | boolean> = {
    NEXT_PUBLIC_SUPABASE_URL: mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_URL: mask(process.env.SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: maskKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_ANON_KEY: maskKey(process.env.SUPABASE_ANON_KEY),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: maskKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    SUPABASE_PUBLISHABLE_KEY: maskKey(process.env.SUPABASE_PUBLISHABLE_KEY),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING",
    VERCEL: process.env.VERCEL ?? "unset",
    NODE_ENV: process.env.NODE_ENV ?? "unset",
  };

  // Resolve the URL + key the app would actually use
  const resolvedUrl = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
  const resolvedKey = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  );

  let connectionTest = "SKIPPED";
  if (resolvedUrl && resolvedKey) {
    try {
      const res = await fetch(`${resolvedUrl}/rest/v1/`, {
        headers: {
          apikey: resolvedKey,
          Authorization: `Bearer ${resolvedKey}`,
        },
      });
      connectionTest = res.ok
        ? "OK (status " + res.status + ")"
        : "FAILED (status " + res.status + " — " + (await res.text()).slice(0, 200) + ")";
    } catch (e) {
      connectionTest = "ERROR: " + (e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({
    envVars: vars,
    resolved: {
      url: resolvedUrl || "EMPTY",
      keyPrefix: resolvedKey ? resolvedKey.slice(0, 20) + "…" : "EMPTY",
    },
    connectionTest,
  }, { status: 200 });
}

function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return "";
}

function mask(v: string | undefined): string {
  const t = v?.trim();
  if (!t) return "MISSING";
  // Show full URL (it's public info — just the project ref)
  return t;
}

function maskKey(v: string | undefined): string {
  const t = v?.trim();
  if (!t) return "MISSING";
  return t.slice(0, 20) + "…" + t.slice(-4) + " (" + t.length + " chars)";
}
