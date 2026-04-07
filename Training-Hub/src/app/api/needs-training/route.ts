import { getEmployeesNeedingTraining } from "@/lib/training-data";
import { getNoShows } from "@/lib/hub-settings";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const training = searchParams.get("training");

    if (!training) {
      return Response.json(
        { error: "Missing query param: training" },
        { status: 400 }
      );
    }

    const division = searchParams.get("division");

    const [employees, noShowRecords] = await Promise.all([
      getEmployeesNeedingTraining(training),
      getNoShows(),
    ]);

    // Build no-show lookup
    const noShowMap = new Map<string, number>();
    for (const rec of noShowRecords) {
      noShowMap.set(rec.name.toLowerCase(), rec.incidents.length);
    }

    let enriched = employees.map((e) => ({
      ...e,
      noShowCount: noShowMap.get(e.name.toLowerCase()) || 0,
    }));

    // Optional division filter (case-insensitive)
    if (division) {
      enriched = enriched.filter(
        (e) => e.division.toLowerCase() === division.toLowerCase()
      );
    }

    return Response.json({ employees: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
