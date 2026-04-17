import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyPanel, PageHeader, Pill, PrimaryLink } from "@/components/training-hub/page-primitives";

export default async function ClassesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("sessions")
    .select("id, scheduled_start, status, location, trainer_name, training_id")
    .order("scheduled_start", { ascending: false })
    .limit(40);

  const tids = [...new Set((rows ?? []).map((r) => r.training_id))];
  const { data: trows } = tids.length > 0
    ? await supabase.from("trainings").select("id, title").in("id", tids)
    : { data: [] as { id: string; title: string }[] };
  const tname = new Map((trows ?? []).map((t) => [t.id, t.title]));

  const hasRows = (rows?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Training"
        title="Classes"
        subtitle="Schedule sessions, build rosters, and run tablet day view."
        actions={<PrimaryLink href="/classes/new">Schedule class</PrimaryLink>}
      />

      {!hasRows ? (
        <EmptyPanel title="No sessions yet." hint="Schedule one to drive rosters and kiosk sign-in." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">Date</th>
                <th className="caption px-4 py-3 text-left">Training</th>
                <th className="caption px-4 py-3 text-left">Location</th>
                <th className="caption px-4 py-3 text-left">Status</th>
                <th className="caption px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((c) => (
                <tr key={c.id} className="row-hover border-b border-[--rule] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-[--ink]">{c.scheduled_start ?? "—"}</td>
                  <td className="px-4 py-3 text-[--ink]">{tname.get(c.training_id) ?? "Session"}</td>
                  <td className="px-4 py-3 text-[--ink-soft]">{c.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Pill tone={c.status === "scheduled" ? "default" : c.status === "completed" ? "success" : "muted"}>
                      {c.status}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/classes/${c.id}/day`} className="text-sm text-[--accent] hover:underline">
                      Open day view →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
