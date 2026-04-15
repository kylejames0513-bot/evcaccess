import { withApiHandler } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { createServerClient } from "@/lib/supabase";

type CountResult = { count: number | null };
type SyncLogRow = { value: string };

export const GET = withApiHandler(async () => {
  await requireHrCookie();
  const db = createServerClient();

  const [
    openPeopleRes,
    openTrainingsRes,
    pendingRosterRes,
    previewImportsRes,
    failedImportsRes,
    newHireAuditRes,
    separationAuditRes,
    syncLogRes,
  ] = await Promise.all([
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
    db.from("imports").select("*", { count: "exact", head: true }).eq("status", "preview"),
    db.from("imports").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("new_hire_tracker_rows").select("*", { count: "exact", head: true }),
    db.from("separation_tracker_rows").select("*", { count: "exact", head: true }),
    db.from("hub_settings").select("value").eq("type", "sync_log"),
  ]);

  const logs = ((syncLogRes.data ?? []) as SyncLogRow[])
    .map((row) => {
      try {
        return JSON.parse(row.value) as { timestamp?: string; source?: string };
      } catch {
        return null;
      }
    })
    .filter((row): row is { timestamp?: string; source?: string } => row !== null)
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

  const lastSync = logs[0] ?? null;

  function countOf(result: CountResult): number {
    return result.count ?? 0;
  }

  const openPeople = countOf(openPeopleRes);
  const openTrainings = countOf(openTrainingsRes);
  const pendingRoster = countOf(pendingRosterRes);
  const previewImports = countOf(previewImportsRes);
  const failedImports = countOf(failedImportsRes);
  const newHireRows = countOf(newHireAuditRes);
  const separationRows = countOf(separationAuditRes);

  return {
    generated_at: new Date().toISOString(),
    kpis: {
      open_people: openPeople,
      open_trainings: openTrainings,
      pending_roster_events: pendingRoster,
      preview_imports: previewImports,
      failed_imports: failedImports,
      new_hire_audit_rows: newHireRows,
      separation_audit_rows: separationRows,
    },
    sync: {
      last_sync_at: lastSync?.timestamp ?? null,
      last_sync_source: lastSync?.source ?? null,
    },
    next_actions: [
      ...(openPeople > 0 || openTrainings > 0
        ? [{ href: "/review", label: "Resolve review queue items", priority: "high" as const }]
        : []),
      ...(pendingRoster > 0
        ? [{ href: "/roster-queue", label: "Approve queued roster batches", priority: "high" as const }]
        : []),
      ...(previewImports > 0
        ? [{ href: "/imports", label: "Commit or discard preview imports", priority: "medium" as const }]
        : []),
      { href: "/operations", label: "Open operations checklist", priority: "medium" as const },
    ],
  };
});
