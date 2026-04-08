import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Support legacy password-only login during transition
    if (!email && password) {
      const correctPassword = process.env.HR_PASSWORD;
      if (correctPassword && password === correctPassword) {
        const cookieStore = await cookies();
        cookieStore.set("hr_session", "authenticated", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
        return Response.json({ success: true, mode: "legacy" });
      }
      return Response.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Supabase Auth: email + password
    if (email && password) {
      const supabase = createServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return Response.json({ error: error.message }, { status: 401 });
      }

      // Set session cookie with the access token
      const cookieStore = await cookies();
      cookieStore.set("hr_session", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      });

      if (data.session) {
        cookieStore.set("sb_access_token", data.session.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
        cookieStore.set("sb_refresh_token", data.session.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7,
          path: "/",
        });
      }

      return Response.json({
        success: true,
        mode: "supabase",
        user: { email: data.user?.email, role: data.user?.user_metadata?.role },
      });
    }

    return Response.json({ error: "Email and password required" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("hr_session");
  const sbToken = cookieStore.get("sb_access_token");

  return Response.json({
    authenticated: session?.value === "authenticated",
    hasSupabaseSession: !!sbToken?.value,
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("hr_session");
  cookieStore.delete("sb_access_token");
  cookieStore.delete("sb_refresh_token");
  return Response.json({ success: true });
}
