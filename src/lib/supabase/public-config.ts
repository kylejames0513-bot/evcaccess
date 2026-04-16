function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return "";
}

/**
 * Public Supabase URL (browser + server). Prefer NEXT_PUBLIC_*.
 */
export function getSupabasePublicUrl(): string {
  return firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL);
}

/**
 * Anon or publishable key for browser + middleware.
 * In the browser bundle only NEXT_PUBLIC_* exist; use next.config `env` to map from SUPABASE_* at build time.
 */
export function getSupabasePublicAnonKey(): string {
  return firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY
  );
}

/**
 * Supabase project URL for Route Handlers / server auth. Prefer integration-style SUPABASE_URL.
 */
export function getSupabaseUrlForServerAuth(): string {
  return firstNonEmpty(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Anon or publishable key for server-side auth only (never exposed to the client bundle).
 * Vercel + Supabase often set SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY without NEXT_PUBLIC_.
 */
export function getSupabaseAnonKeyForServerAuth(): string {
  return firstNonEmpty(
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
