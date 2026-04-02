import { NextResponse } from "next/server";
import { invalidateAll } from "@/lib/cache";

export async function POST() {
  invalidateAll();
  return NextResponse.json({ success: true });
}
