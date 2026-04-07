import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    const correctPassword = process.env.HR_PASSWORD;
    if (!correctPassword) {
      return Response.json({ error: "HR_PASSWORD not configured" }, { status: 500 });
    }

    if (password !== correctPassword) {
      return Response.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Set a session cookie (httpOnly, 24 hours)
    const cookieStore = await cookies();
    cookieStore.set("hr_session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("hr_session");
  return Response.json({ authenticated: session?.value === "authenticated" });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("hr_session");
  return Response.json({ success: true });
}
