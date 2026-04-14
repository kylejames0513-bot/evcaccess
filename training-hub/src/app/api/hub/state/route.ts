import { NextResponse } from "next/server";
import { readHubState } from "@/lib/training/state-store";

export async function GET() {
  const state = await readHubState();
  return NextResponse.json(state);
}
