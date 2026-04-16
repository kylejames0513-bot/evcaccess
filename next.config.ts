import type { NextConfig } from "next";

/** Prefer first non-empty value (Vercel integration may omit NEXT_PUBLIC_* prefixes). */
function pickPublicEnv(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return t;
  }
  return "";
}

const nextConfig: NextConfig = {
  // Inlines into the client bundle at build time so the browser sees a valid anon key
  // when the integration only defines SUPABASE_ANON_KEY (no NEXT_PUBLIC_ prefix).
  env: {
    NEXT_PUBLIC_SUPABASE_URL: pickPublicEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_URL
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: pickPublicEnv(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY
    ),
  },
};

export default nextConfig;
