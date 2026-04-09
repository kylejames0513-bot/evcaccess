import { getTrainingData, getScheduledSessions } from "@/lib/training-data";
import { namesMatch } from "@/lib/name-utils";
import { trainingMatchesAny } from "@/lib/training-match";
import { getNoShows } from "@/lib/hub-settings";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    if (!name) {
      return Response.json({ error: "Missing query param: name" }, { status: 400 });
    }

    const [data, noShowRecords] = await Promise.all([
      getTrainingData(),
      getNoShows(),
    ]);
    const employee = data.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (!employee) {
      return Response.json({ error: `Employee "${name}" not found` }, { status: 404 });
    }

    const sessions = await getScheduledSessions();

    // Build training detail list
    const trainings = Object.entries(employee.trainings).map(([columnKey, t]) => {
      // Find scheduled sessions for this training
      const enrolledSession = sessions.find(
        (s) => s.status === "scheduled" &&
          trainingMatchesAny(s.training, columnKey) &&
          s.enrolled.some((n) => namesMatch(n, employee.name))
      );

      const openSessions = sessions.filter(
        (s) => s.status === "scheduled" &&
          trainingMatchesAny(s.training, columnKey) &&
          s.enrolled.length < s.capacity &&
          !s.enrolled.some((n) => namesMatch(n, employee.name))
      ).map((s) => ({
        id: s.id,
        training: s.training,
        date: s.date,
        time: s.time,
        location: s.location,
        enrolledCount: s.enrolled.length,
        capacity: s.capacity,
        sortDateMs: s.sortDateMs,
      })).sort((a, b) => a.sortDateMs - b.sortDateMs);

      return {
        columnKey,
        value: t.value,
        date: t.date ? t.date.toISOString().split("T")[0] : null,
        status: t.status,
        isExcused: t.isExcused,
        enrolledIn: enrolledSession ? { date: enrolledSession.date, time: enrolledSession.time } : null,
        openSessions,
      };
    });

    // Build no-show count for this employee
    const noShowCounts = new Map<string, number>();
    for (const rec of noShowRecords) {
      noShowCounts.set(rec.name.toLowerCase(), rec.incidents.length);
    }
    const noShowCount = noShowCounts.get(employee.name.toLowerCase()) || 0;

    return Response.json({
      name: employee.name,
      trainings,
      noShowCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
