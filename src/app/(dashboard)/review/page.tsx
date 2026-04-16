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

export default async function ReviewPage() {
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

  const { data: peopleRaw } = await supabase
    .from("unresolved_people")
    .select("id, raw_name, reason, confidence, resolved")
    .eq("org_id", profile.org_id)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  const people = (peopleRaw ?? []) as {
    id: string;
    raw_name: string;
    reason: string;
    confidence: number | null;
    resolved: boolean;
  }[];

  const { data: trainingsRaw } = await supabase
    .from("unknown_trainings")
    .select("id, raw_training_name, resolved")
    .eq("org_id", profile.org_id)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  const trainings = (trainingsRaw ?? []) as {
    id: string;
    raw_training_name: string;
    resolved: boolean;
  }[];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resolution queues</h1>
        <p className="text-sm text-[#8b8fa3]">
          Resolve names and trainings so nothing silently drops. High confidence matches can bulk resolve later.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Unresolved people</h2>
        <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2e3d] hover:bg-transparent">
                <TableHead className="text-[#8b8fa3]">Raw name</TableHead>
                <TableHead className="text-[#8b8fa3]">Reason</TableHead>
                <TableHead className="text-[#8b8fa3]">Confidence</TableHead>
                <TableHead className="text-[#8b8fa3]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.length ? (
                people.map((p) => (
                  <TableRow key={p.id} className="border-[#2a2e3d]">
                    <TableCell className="text-[#e8eaed]">{p.raw_name}</TableCell>
                    <TableCell className="text-[#8b8fa3]">{p.reason}</TableCell>
                    <TableCell className="font-mono text-xs">{p.confidence ?? "—"}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline" className="border-[#2a2e3d]">
                        <Link href={`/employees`}>Match in roster</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-[#8b8fa3]">
                    Queue is clear. Nice work.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Unknown trainings</h2>
        <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2e3d] hover:bg-transparent">
                <TableHead className="text-[#8b8fa3]">Raw training</TableHead>
                <TableHead className="text-[#8b8fa3]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {trainings.length ? (
                trainings.map((t) => (
                  <TableRow key={t.id} className="border-[#2a2e3d]">
                    <TableCell className="text-[#e8eaed]">{t.raw_training_name}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline" className="border-[#2a2e3d]">
                        <Link href="/trainings/new">Create training type</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="h-24 text-center text-[#8b8fa3]">
                    No unknown trainings waiting.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
