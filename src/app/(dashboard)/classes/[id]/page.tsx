import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EmptyPanel,
  PageHeader,
  Pill,
  Section,
  StatCard,
  SecondaryLink,
} from "@/components/training-hub/page-primitives";
import { RosterPanel } from "@/components/training-hub/roster-panel";
import { ClassStatusBar } from "@/components/training-hub/class-status-bar";
import { getRosterCandidates } from "@/lib/roster-candidates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const opt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return e ? `${s.toLocaleTimeString("en-US", opt)} – ${e.toLocaleTimeString("en-US", opt)}` : s.toLocaleTimeString("en-US", opt);
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, training_id, scheduled_start, scheduled_end, location, trainer_name, capacity, status, title, session_kind, notes, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  const { data: training } = await supabase
    .from("trainings")
    .select("id, code, title, cadence_type, cadence_months")
    .eq("id", session.training_id)
    .maybeSingle();

  const { data: enrollmentsRaw } = await supabase
    .from("session_enrollments")
    .select(
      "id, employee_id, status, source, enrolled_at, attendance_marked_at, notes",
    )
    .eq("session_id", id)
    .order("enrolled_at", { ascending: true });
  const enrollments = enrollmentsRaw ?? [];

  const enrolledIds = new Set(enrollments.map((e) => e.employee_id));

  // Hydrate enrollments with employee info
  const employeeIds = [...enrolledIds];
  const empMap = new Map<
    string,
    { id: string; legal_first_name: string; legal_last_name: string; preferred_name: string | null; department: string | null; location: string | null; position: string | null }
  >();
  if (employeeIds.length > 0) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, legal_first_name, legal_last_name, preferred_name, department, location, position")
      .in("id", employeeIds);
    for (const e of emps ?? []) empMap.set(e.id, e);
  }

  const hydratedEnrollments = enrollments.map((e) => ({
    ...e,
    employee: empMap.get(e.employee_id) ?? null,
  }));

  // Candidates to add to the roster
  const candidates = await getRosterCandidates({
    supabase,
    trainingId: session.training_id,
    alreadyEnrolled: enrolledIds,
    sessionKind: session.session_kind ?? "standalone",
  });

  // Tallies
  const statusCounts = hydratedEnrollments.reduce<Record<string, number>>((acc, e) => {
    acc[e.status ?? "enrolled"] = (acc[e.status ?? "enrolled"] ?? 0) + 1;
    return acc;
  }, {});

  const attending = hydratedEnrollments.filter((e) =>
    ["enrolled", "confirmed", "attended"].includes(e.status ?? "enrolled"),
  ).length;

  const complianceTone =
    session.status === "completed"
      ? "success"
      : session.status === "cancelled"
        ? "muted"
        : session.status === "in_progress"
          ? "warn"
          : "default";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={training?.code ?? "Class"}
        title={session.title ?? training?.title ?? "Class"}
        subtitle={
          <>
            <span>{formatDate(session.scheduled_start)}</span>
            <span className="mx-2 text-[--ink-muted]">·</span>
            <span>{formatTimeRange(session.scheduled_start, session.scheduled_end)}</span>
            {session.location && (
              <>
                <span className="mx-2 text-[--ink-muted]">·</span>
                <span>{session.location}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Pill tone={complianceTone}>{session.status}</Pill>
            <SecondaryLink href="/classes">All classes</SecondaryLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Attending" value={attending} />
        <StatCard label="Capacity" value={session.capacity ?? "—"} />
        <StatCard
          label="No-shows"
          value={statusCounts["no_show"] ?? 0}
          tone={(statusCounts["no_show"] ?? 0) > 0 ? "alert" : "muted"}
        />
        <StatCard
          label="Excused"
          value={statusCounts["excused"] ?? 0}
          tone="muted"
        />
      </div>

      <ClassStatusBar sessionId={session.id} status={session.status} />

      <Section label="Details">
        <dl className="panel grid gap-x-6 gap-y-3 p-6 text-sm md:grid-cols-2">
          <DetailRow label="Training" value={training ? `${training.title} (${training.code})` : "—"} />
          <DetailRow label="Trainer" value={session.trainer_name ?? "—"} />
          <DetailRow label="Session kind" value={session.session_kind ?? "standalone"} />
          <DetailRow
            label="Cadence"
            value={
              training?.cadence_type === "unset"
                ? "not set"
                : training?.cadence_months
                  ? `${training.cadence_months}-month renewal`
                  : training?.cadence_type ?? "—"
            }
          />
          {session.notes && (
            <div className="md:col-span-2">
              <DetailRow label="Notes" value={session.notes} />
            </div>
          )}
        </dl>
      </Section>

      <Section label={`Roster · ${attending}${session.capacity ? ` / ${session.capacity}` : ""}`}>
        {hydratedEnrollments.length === 0 && candidates.totalAvailable === 0 ? (
          <EmptyPanel
            title="No one to add yet."
            hint="Once the roster has people, attendance + the memo both light up."
          />
        ) : (
          <RosterPanel
            sessionId={session.id}
            sessionStatus={session.status}
            enrollments={hydratedEnrollments}
            candidates={candidates}
          />
        )}
      </Section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="caption w-28 shrink-0">{label}</dt>
      <dd className="text-[--ink]">{value}</dd>
    </div>
  );
}

