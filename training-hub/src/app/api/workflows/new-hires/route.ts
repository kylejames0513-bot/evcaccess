import { withApiHandler } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { createServerClient } from "@/lib/supabase";

type CountResult = { count: number | null };

type RecentNewHireRow = {
  id: string;
  sheet: string;
  row_number: number;
  first_name: string;
  last_name: string;
  hire_date: string;
  status: string;
  updated_at: string;
};

export const GET = withApiHandler(async () => {
  await requireHrCookie();
  const db = createServerClient();
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    trackerRowsRes,
    unresolvedPeopleRes,
    unknownTrainingsRes,
    pendingRosterRes,
    activeNewHiresRes,
    missingHireDateRes,
    recentRowsRes,
  ] = await Promise.all([
    db.from("new_hire_tracker_rows").select("*", { count: "exact", head: true }),
    db
      .from("unresolved_people")
      .select("*", { count: "exact", head: true })
      .is("resolved_at", null),
    db
      .from("unknown_trainings")
      .select("*", { count: "exact", head: true })
      .is("resolved_at", null),
    db
      .from("pending_roster_events")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"]),
    db
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .gte("hire_date", cutoff90d),
    db
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .is("hire_date", null),
    db
      .from("new_hire_tracker_rows")
      .select(
        "id, sheet, row_number, first_name, last_name, hire_date, status, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(12),
  ]);

  function countOf(result: CountResult): number {
    return result.count ?? 0;
  }

  const reviewPeopleOpen = countOf(unresolvedPeopleRes);
  const reviewTrainingsOpen = countOf(unknownTrainingsRes);
  const pendingRoster = countOf(pendingRosterRes);

  return {
    generated_at: new Date().toISOString(),
    totals: {
      tracker_rows: countOf(trackerRowsRes),
      review_people_open: reviewPeopleOpen,
      review_trainings_open: reviewTrainingsOpen,
      pending_roster_events: pendingRoster,
      active_new_hires_90d: countOf(activeNewHiresRes),
      active_new_hires_without_hire_date: countOf(missingHireDateRes),
    },
    recent_tracker_rows: (recentRowsRes.data ?? []) as RecentNewHireRow[],
    next_actions: [
      ...(reviewPeopleOpen + reviewTrainingsOpen > 0
        ? [
            {
              href: "/review",
              label: "Resolve unmatched people/trainings",
              priority: "high" as const,
            },
          ]
        : []),
      ...(pendingRoster > 0
        ? [
            {
              href: "/roster-queue",
              label: "Approve pending roster batches",
              priority: "high" as const,
            },
          ]
        : []),
      {
        href: "/tracker/new-hires",
        label: "Reconcile workbook row anchors",
        priority: "medium" as const,
      },
      {
        href: "/imports",
        label: "Run merged-sheet import preview/commit",
        priority: "medium" as const,
      },
      {
        href: "/new-hires",
        label: "Open onboarding completion dashboard",
        priority: "low" as const,
      },
    ],
  };
});
