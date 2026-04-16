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
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: rows } = await supabase
    .from("classes")
    .select("id, scheduled_date, status, location, instructor, training_type_id")
    .eq("org_id", profile.org_id)
    .order("scheduled_date", { ascending: false })
    .limit(40);
  const tids = [...new Set((rows ?? []).map((r) => r.training_type_id))];
  const { data: trows } =
    tids.length > 0
      ? await supabase.from("training_types").select("id, name").in("id", tids)
      : { data: [] as { id: string; name: string }[] };
  const tname = new Map((trows ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
          <p className="text-sm text-[#8b8fa3]">Schedule sessions, build rosters, and run tablet day view.</p>
        </div>
        <Button asChild className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
          <Link href="/classes/new">Schedule class</Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2e3d] hover:bg-transparent">
              <TableHead className="text-[#8b8fa3]">Date</TableHead>
              <TableHead className="text-[#8b8fa3]">Training</TableHead>
              <TableHead className="text-[#8b8fa3]">Location</TableHead>
              <TableHead className="text-[#8b8fa3]">Status</TableHead>
              <TableHead className="text-[#8b8fa3]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length ? (
              (rows ?? []).map((c) => (
                <TableRow key={c.id} className="border-[#2a2e3d]">
                  <TableCell className="font-mono text-xs text-[#e8eaed]">{c.scheduled_date}</TableCell>
                  <TableCell className="text-[#e8eaed]">
                    {tname.get(c.training_type_id) ?? "Class"}
                  </TableCell>
                  <TableCell className="text-[#8b8fa3]">{c.location}</TableCell>
                  <TableCell className="text-[#8b8fa3]">{c.status}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost" className="text-[#3b82f6]">
                      <Link href={`/classes/${c.id}/day`}>Open day view</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-[#8b8fa3]">
                  No classes yet. Schedule one to drive rosters and kiosk sign in.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
