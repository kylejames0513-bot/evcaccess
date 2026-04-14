import { NextResponse } from "next/server";
import { parseImportCsvs } from "@/lib/training/csv";
import { writeHubState } from "@/lib/training/state-store";
import type { ImportPayload } from "@/lib/training/types";

export async function POST(request: Request) {
  let payload: ImportPayload;
  try {
    payload = (await request.json()) as ImportPayload;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body. Expected employeesCsv and recordsCsv fields.",
      },
      { status: 400 },
    );
  }

  try {
    const result = parseImportCsvs(payload.employeesCsv, payload.recordsCsv);
    await writeHubState({
      data: result.data,
      summary: result.summary,
      sync: {
        lastRunId: null,
        lastSource: "csv-import",
        lastPushedAt: new Date().toISOString(),
        pushCount: 0,
        processedRunIds: [],
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse and analyze CSV input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
