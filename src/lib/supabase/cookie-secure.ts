import type { NextRequest } from "next/server";
import { headers } from "next/headers";

/**
 * Use `Secure` on auth cookies only when the connection is HTTPS.
 * `NODE_ENV === "production"` alone is wrong for `next start` on http://localhost:
 * browsers drop Secure cookies on plain HTTP, so login appears to do nothing.
 */
export function supabaseCookieSecureFromRequest(request: NextRequest): boolean {
  if (process.env.VERCEL === "1") return true;
  if (request.nextUrl.protocol === "https:") return true;
  const xfp = request.headers.get("x-forwarded-proto");
  if (xfp) {
    const first = xfp.split(",")[0]?.trim();
    if (first === "https") return true;
  }
  const host = request.nextUrl.host.toLowerCase();
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return false;
  // Non-localhost host without explicit x-forwarded-proto — assume production HTTPS.
  return true;
}

/** For Server Components / actions that only have `headers()` (no Request). */
export async function supabaseCookieSecureFromHeaders(): Promise<boolean> {
  if (process.env.VERCEL === "1") return true;
  const h = await headers();
  const xfp = h.get("x-forwarded-proto");
  if (xfp) {
    const first = xfp.split(",")[0]?.trim();
    if (first === "https") return true;
  }
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return false;
  // Non-localhost host without explicit x-forwarded-proto — assume production HTTPS.
  return true;
}
