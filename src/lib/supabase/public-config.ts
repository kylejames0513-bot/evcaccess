function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return "";
}

/**
 * Public Supabase URL (browser + server).
 * Prefer integration-set SUPABASE_URL over manually-set NEXT_PUBLIC_* which
 * can go stale when the Vercel Supabase integration rotates keys.
 * In the browser bundle, next.config `env` inlines the resolved value.
 */
export function getSupabasePublicUrl(): string {
  return firstNonEmpty(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Anon or publishable key for browser + middleware.
 * Prefer integration-set keys (SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY)
 * over manually-set NEXT_PUBLIC_* which can go stale.
 * In the browser bundle, next.config `env` inlines the resolved value.
 */
export function getSupabasePublicAnonKey(): string {
  return firstNonEmpty(
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

/**
 * Supabase project URL for Route Handlers / server auth.
 */
export function getSupabaseUrlForServerAuth(): string {
  return firstNonEmpty(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Anon or publishable key for server-side auth only (never exposed to the client bundle).
 */
export function getSupabaseAnonKeyForServerAuth(): string {
  return firstNonEmpty(
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
