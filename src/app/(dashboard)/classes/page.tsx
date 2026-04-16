import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClassesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("sessions")
    .select("id, scheduled_start, status, location, trainer_name, training_id")
    .order("scheduled_start", { ascending: false })
    .limit(40);

  const tids = [...new Set((rows ?? []).map((r) => r.training_id))];
  const { data: trows } =
    tids.length > 0
      ? await supabase.from("trainings").select("id, title").in("id", tids)
      : { data: [] as { id: string; title: string }[] };
  const tname = new Map((trows ?? []).map((t) => [t.id, t.title]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight" style={{ color: "var(--ink)" }}>Classes</h1>
          <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
            Schedule sessions, build rosters, and run tablet day view.
          </p>
        </div>
        <Button asChild className="rounded-lg text-white" style={{ backgroundColor: "var(--accent)" }}>
          <Link href="/classes/new">Schedule class</Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--rule)" }}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent" style={{ borderColor: "var(--rule)" }}>
              <TableHead style={{ color: "var(--ink-muted)" }}>Date</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Training</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Location</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Status</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length ? (
              (rows ?? []).map((c) => (
                <TableRow key={c.id} style={{ borderColor: "var(--rule)" }}>
                  <TableCell className="font-mono text-xs" style={{ color: "var(--ink)" }}>
                    {c.scheduled_start ?? "—"}
                  </TableCell>
                  <TableCell style={{ color: "var(--ink)" }}>
                    {tname.get(c.training_id) ?? "Session"}
                  </TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{c.location}</TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{c.status}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost" style={{ color: "var(--accent)" }}>
                      <Link href={`/classes/${c.id}/day`}>Open day view</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center" style={{ color: "var(--ink-muted)" }}>
                  No sessions yet. Schedule one to drive rosters and kiosk sign-in.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
