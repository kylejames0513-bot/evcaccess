import { NextResponse } from "next/server";
import { processHubPush } from "@/lib/training/state-store";
import type { HubPushPayload } from "@/lib/training/types";

export async function POST(request: Request) {
  let payload: HubPushPayload;
  try {
    payload = (await request.json()) as HubPushPayload;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  if (!payload.runId?.trim()) {
    return NextResponse.json({ error: "runId is required." }, { status: 400 });
  }

  try {
    const result = await processHubPush(payload);

    return NextResponse.json({
      accepted: result.imported,
      skipped: result.ignored,
      message: result.message,
      state: result.state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to normalize pushed data.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
