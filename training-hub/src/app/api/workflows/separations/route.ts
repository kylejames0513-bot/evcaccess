import { withApiHandler } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { createServerClient } from "@/lib/supabase";

type CountResult = { count: number | null };

type SeparationAuditRow = {
  id: string;
  fy_sheet: string;
  row_number: number;
  first_name: string;
  last_name: string;
  date_of_separation: string;
  sync_status: string | null;
  notes: string | null;
};

type SyncLog = {
  timestamp?: string;
  source?: string;
  total_rows?: number;
  applied?: number;
  skipped?: number;
  errors?: number;
};

export const GET = withApiHandler(async () => {
  await requireHrCookie();
  const db = createServerClient();
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    auditRowsCountRes,
    auditRowsRes,
    unresolvedPeopleRes,
    unknownTrainingsRes,
    pendingRosterRes,
    inactive30dRes,
    syncLogRes,
  ] = await Promise.all([
    db.from("separation_tracker_rows").select("*", { count: "exact", head: true }),
    db
      .from("separation_tracker_rows")
      .select(
        "id, fy_sheet, row_number, first_name, last_name, date_of_separation, sync_status, notes"
      )
      .order("updated_at", { ascending: false })
      .limit(12),
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
      .eq("is_active", false)
      .gte("terminated_at", cutoff30d),
    db.from("hub_settings").select("value").eq("type", "sync_log"),
  ]);

  function countOf(result: CountResult): number {
    return result.count ?? 0;
  }

  const logs = ((syncLogRes.data ?? []) as Array<{ value: string }>)
    .map((row) => {
      try {
        return JSON.parse(row.value) as SyncLog;
      } catch {
        return null;
      }
    })
    .filter((row): row is SyncLog => row !== null)
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

  const lastSync = logs[0] ?? null;
  const stale =
    !lastSync?.timestamp ||
    Date.now() - new Date(lastSync.timestamp).getTime() > 24 * 60 * 60 * 1000;

  const unresolvedPeople = countOf(unresolvedPeopleRes);
  const unknownTrainings = countOf(unknownTrainingsRes);
  const pendingRoster = countOf(pendingRosterRes);

  return {
    generated_at: new Date().toISOString(),
    kpis: {
      audit_rows: countOf(auditRowsCountRes),
      unresolved_people: unresolvedPeople,
      unknown_trainings: unknownTrainings,
      pending_roster_events: pendingRoster,
      inactive_last_30_days: countOf(inactive30dRes),
    },
    sync: {
      last_sync_at: lastSync?.timestamp ?? null,
      stale,
      recent: logs.slice(0, 8),
    },
    audit_preview: (auditRowsRes.data ?? []) as SeparationAuditRow[],
    action_links: [
      ...(pendingRoster > 0
        ? [
            {
              href: "/roster-queue",
              label: "Approve queued roster batches",
              description: "Separation updates are waiting for HR approval.",
              priority: "high" as const,
            },
          ]
        : []),
      ...(unresolvedPeople > 0 || unknownTrainings > 0
        ? [
            {
              href: "/review",
              label: "Resolve separation import exceptions",
              description:
                "Fix unmatched people/training aliases before the next workbook push.",
              priority: "high" as const,
            },
          ]
        : []),
      {
        href: "/reports",
        label: "Review separation summary",
        description: "Validate trends and totals after workbook sync.",
        priority: "medium" as const,
      },
      {
        href: "/tracker/separations",
        label: "Reconcile workbook row anchors",
        description: "Use FY sheet + row anchors for line-by-line verification.",
        priority: "medium" as const,
      },
      {
        href: "/docs/sync-contract",
        label: "Sync contract reference",
        description: "Payload, token, and workbook contract details.",
        priority: "low" as const,
      },
    ],
  };
});
