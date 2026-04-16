import { redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RunLogPage() {
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

  const { data: runs } = await supabase
    .from("import_runs")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("started_at", { ascending: false })
    .limit(40);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run log</h1>
        <p className="text-sm text-[#8b8fa3]">Imports and other batch jobs, newest first.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2e3d] hover:bg-transparent">
              <TableHead className="text-[#8b8fa3]">Started</TableHead>
              <TableHead className="text-[#8b8fa3]">Source</TableHead>
              <TableHead className="text-[#8b8fa3]">Status</TableHead>
              <TableHead className="text-[#8b8fa3]">Inserted</TableHead>
              <TableHead className="text-[#8b8fa3]">Unresolved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runs ?? []).length ? (
              (runs ?? []).map((r) => (
                <TableRow key={r.id} className="border-[#2a2e3d]">
                  <TableCell className="font-mono text-xs text-[#e8eaed]">{r.started_at}</TableCell>
                  <TableCell className="text-[#8b8fa3]">{r.source}</TableCell>
                  <TableCell className="text-[#8b8fa3]">{r.status}</TableCell>
                  <TableCell className="text-[#e8eaed]">{r.rows_inserted}</TableCell>
                  <TableCell className="text-[#e8eaed]">{r.rows_unresolved}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-[#8b8fa3]">
                  No runs logged yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
