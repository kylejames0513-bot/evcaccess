import { NextResponse } from "next/server";

export async function POST() {
  // No cache to invalidate -- Supabase queries are always fresh
  return NextResponse.json({ success: true });
}
