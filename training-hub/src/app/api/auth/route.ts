import { cookies } from "next/headers";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const providedPassword = typeof body.password === "string" ? body.password.trim() : "";
  const expectedPassword = process.env.HR_PASSWORD?.trim() || "tennyson";
  if (!providedPassword) {
    throw new ApiError("Password is required", 400, "missing_field");
  }
  if (providedPassword !== expectedPassword) {
    throw new ApiError("Incorrect password", 401, "unauthorized");
  }

  const cookieStore = await cookies();
  cookieStore.set("hr_session", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  return { success: true, mode: "shared_password" };
});

export const GET = withApiHandler(async () => {
  const cookieStore = await cookies();
  const session = cookieStore.get("hr_session");

  return {
    authenticated: session?.value === "authenticated",
    hasSupabaseSession: false,
    legacyLoginEnabled: true,
  };
});

export const DELETE = withApiHandler(async () => {
  const cookieStore = await cookies();
  cookieStore.delete("hr_session");
  return { success: true };
});
