/**
 * Public Supabase URL + anon (or publishable) key for browser and SSR clients.
 * Prefer NEXT_PUBLIC_*; fall back to names Vercel's Supabase integration often uses.
 */
export function getSupabasePublicUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

export function getSupabasePublicAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}
