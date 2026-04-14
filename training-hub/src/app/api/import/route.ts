import { NextResponse } from "next/server";
import { parseImportCsvs } from "@/lib/training/csv";
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
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse and analyze CSV input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
