import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function greetingTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch stats from new schema (single-tenant, no org_id filter)
  const { count: activeEmployees } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title, cadence_type")
    .eq("active", true);

  const unconfiguredCount = (trainings ?? []).filter(t => t.cadence_type === "unset").length;

  const { count: totalSeparations } = await supabase
    .from("separations")
    .select("id", { count: "exact", head: true });

  const { count: activeNewHires } = await supabase
    .from("new_hires")
    .select("id", { count: "exact", head: true })
    .not("stage", "in", '("complete","withdrew","terminated_in_probation")');

  const { count: pendingReview } = await supabase
    .from("review_queue")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false);

  // Build summary line
  const parts: string[] = [];
  if (unconfiguredCount > 0) parts.push(`${unconfiguredCount} training${unconfiguredCount === 1 ? "" : "s"} need${unconfiguredCount === 1 ? "s" : ""} renewal timeframes`);
  if ((activeNewHires ?? 0) > 0) parts.push(`${activeNewHires} new hire${activeNewHires === 1 ? "" : "s"} in the pipeline`);
  if ((pendingReview ?? 0) > 0) parts.push(`${pendingReview} item${pendingReview === 1 ? "" : "s"} in the review queue`);
  const summaryLine = parts.length > 0
    ? parts.join(", ") + "."
    : "Nothing urgent today. The system is quiet.";

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <p className="caption">{formatDate()}</p>
        <h1 className="font-display text-[32px] font-medium leading-tight tracking-[-0.01em] mt-1">
          {greetingTime()}, Kyle.
        </h1>
        <p className="font-display text-base italic text-[--ink-soft] mt-2">
          {summaryLine}
        </p>
      </div>

      {/* First-run setup banner */}
      {unconfiguredCount > 0 && (
        <div className="rounded-lg border border-[--accent]/20 bg-[--accent-soft] px-6 py-4">
          <p className="text-sm text-[--accent]">
            <strong>{unconfiguredCount} training{unconfiguredCount === 1 ? "" : "s"}</strong> need renewal timeframes before compliance can be calculated.
          </p>
          <Link
            href="/trainings"
            className="mt-2 inline-block text-sm font-medium text-[--accent] underline underline-offset-2"
          >
            Open training catalog
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
          <p className="caption">Active employees</p>
          <p className="stat-big mt-2">{activeEmployees ?? 0}</p>
          <Link href="/employees" className="mt-3 inline-block text-sm text-[--accent] hover:underline">
            View roster
          </Link>
        </div>
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
          <p className="caption">Training catalog</p>
          <p className="stat-big mt-2">{trainings?.length ?? 0}</p>
          <Link href="/trainings" className="mt-3 inline-block text-sm text-[--accent] hover:underline">
            Manage trainings
          </Link>
        </div>
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
          <p className="caption">Separations (all time)</p>
          <p className="stat-big mt-2">{totalSeparations ?? 0}</p>
          <Link href="/separations" className="mt-3 inline-block text-sm text-[--accent] hover:underline">
            View separations
          </Link>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
          <p className="caption">New hires in pipeline</p>
          <p className="stat-big mt-2">{activeNewHires ?? 0}</p>
          <Link href="/new-hires" className="mt-3 inline-block text-sm text-[--accent] hover:underline">
            View pipeline
          </Link>
        </div>
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
          <p className="caption">Review queue</p>
          <p className="stat-big mt-2">{pendingReview ?? 0}</p>
          <Link href="/ingestion" className="mt-3 inline-block text-sm text-[--accent] hover:underline">
            Open review
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <p className="caption mb-3">Quick actions</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/separations/new"
            className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm font-medium text-[--ink] hover:bg-[--surface-alt] transition-colors"
          >
            Log a separation
          </Link>
          <Link
            href="/new-hires/new"
            className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm font-medium text-[--ink] hover:bg-[--surface-alt] transition-colors"
          >
            Start a new hire
          </Link>
          <Link
            href="/trainings"
            className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm font-medium text-[--ink] hover:bg-[--surface-alt] transition-colors"
          >
            Training catalog
          </Link>
          <Link
            href="/ingestion"
            className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm font-medium text-[--ink] hover:bg-[--surface-alt] transition-colors"
          >
            Sync data
          </Link>
        </div>
      </div>
    </div>
  );
}
