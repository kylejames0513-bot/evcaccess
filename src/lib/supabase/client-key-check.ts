/**
 * Catch common misconfigurations before createClient (Supabase only says "Invalid API key").
 * Runs in the browser only.
 */
export function assertUsableSupabasePublishableKey(url: string, key: string): void {
  const k = key.trim();
  const u = url.trim().replace(/\/+$/, "");

  if (!u || !k) {
    throw new Error("Supabase URL or API key is empty. Check Vercel env vars and redeploy.");
  }

  if (k.startsWith("sb_secret_")) {
    throw new Error(
      "The key looks like a Supabase secret key (sb_secret_…). Use the anon or publishable key for the browser, not the secret/service key."
    );
  }

  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
      const json = typeof atob === "function" ? atob(b64 + pad) : "";
      const payload = JSON.parse(json) as { role?: string; ref?: string };
      if (payload.role === "service_role") {
        throw new Error(
          "This JWT is the service_role key. Use the anon JWT or publishable key (Dashboard → API) for login in the browser."
        );
      }
      if (payload.ref && u.includes(".supabase.co")) {
        let host: string;
        try {
          host = new URL(u).hostname;
        } catch {
          return;
        }
        const expected = `${payload.ref}.supabase.co`;
        if (host !== expected) {
          throw new Error(
            `Supabase URL host (${host}) does not match this API key's project (${expected}). Use URL + key from the same project.`
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("This JWT")) throw e;
      if (e instanceof Error && e.message.startsWith("Supabase URL host")) throw e;
      if (e instanceof Error && e.message.startsWith("The key looks")) throw e;
      /* not a JWT we could parse — ok */
    }
  }
}
