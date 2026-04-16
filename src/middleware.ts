import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/public-config";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = getSupabasePublicUrl();
  const anon = getSupabasePublicAnonKey();
  if (!url || !anon) {
    return supabaseResponse;
  }
  const supabase = createServerClient<Database>(url, anon, {
    cookieOptions: {
      secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (responseHeaders && typeof responseHeaders === "object") {
          for (const [key, value] of Object.entries(responseHeaders)) {
            if (typeof value === "string") {
              supabaseResponse.headers.set(key, value);
            }
          }
        }
      },
    },
  });
  await supabase.auth.getUser();
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
