import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PageHeader,
  StatCard,
  Section,
  PrimaryLink,
  SecondaryLink,
} from "@/components/training-hub/page-primitives";

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

  const { count: activeEmployees } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title, cadence_type")
    .eq("active", true);

  const unconfiguredCount = (trainings ?? []).filter((t) => t.cadence_type === "unset").length;

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

  const parts: string[] = [];
  if (unconfiguredCount > 0) {
    parts.push(
      `${unconfiguredCount} training${unconfiguredCount === 1 ? "" : "s"} need${unconfiguredCount === 1 ? "s" : ""} renewal timeframes`
    );
  }
  if ((activeNewHires ?? 0) > 0) {
    parts.push(`${activeNewHires} new hire${activeNewHires === 1 ? "" : "s"} in the pipeline`);
  }
  if ((pendingReview ?? 0) > 0) {
    parts.push(`${pendingReview} item${pendingReview === 1 ? "" : "s"} in the review queue`);
  }
  const summaryLine =
    parts.length > 0 ? parts.join(", ") + "." : "Nothing urgent today. The system is quiet.";

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={formatDate()}
        title={`${greetingTime()}, Kyle.`}
        subtitle={<span className="italic">{summaryLine}</span>}
      />

      {unconfiguredCount > 0 && (
        <div className="panel border-[--accent]/25 bg-[--accent-soft] px-6 py-4">
          <p className="text-sm text-[--accent]">
            <strong>
              {unconfiguredCount} training{unconfiguredCount === 1 ? "" : "s"}
            </strong>{" "}
            need renewal timeframes before compliance can be calculated.
          </p>
          <PrimaryLink href="/trainings" className="mt-3">
            Open training catalog
          </PrimaryLink>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard label="Active employees" value={activeEmployees ?? 0} href="/employees" hint="View roster" />
        <StatCard label="Training catalog" value={trainings?.length ?? 0} href="/trainings" hint="Manage trainings" />
        <StatCard label="Separations (all time)" value={totalSeparations ?? 0} href="/separations" hint="View separations" />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <StatCard label="New hires in pipeline" value={activeNewHires ?? 0} href="/new-hires" hint="View pipeline" />
        <StatCard label="Review queue" value={pendingReview ?? 0} href="/ingestion" hint="Open review" tone={(pendingReview ?? 0) > 0 ? "warn" : "default"} />
      </div>

      <Section label="Quick actions">
        <div className="flex flex-wrap gap-2">
          <SecondaryLink href="/separations/new">Log a separation</SecondaryLink>
          <SecondaryLink href="/new-hires/new">Start a new hire</SecondaryLink>
          <SecondaryLink href="/trainings">Training catalog</SecondaryLink>
          <SecondaryLink href="/ingestion">Sync data</SecondaryLink>
        </div>
      </Section>
    </div>
  );
}
