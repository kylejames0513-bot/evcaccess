import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!emp) notFound();

  const { data: completions } = await supabase
    .from("completions")
    .select("completed_on, expires_on, source, training_type_id")
    .eq("employee_id", id)
    .order("completed_on", { ascending: false });

  const typeIds = [...new Set((completions ?? []).map((c) => c.training_type_id))];
  const { data: typeRows } =
    typeIds.length > 0
      ? await supabase.from("training_types").select("id, name").in("id", typeIds)
      : { data: [] as { id: string; name: string }[] };
  const typeName = new Map((typeRows ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0 text-[#3b82f6]">
            <Link href="/employees">Back to roster</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {emp.first_name} {emp.last_name}
          </h1>
          <p className="font-mono text-sm text-[#8b8fa3]">{emp.paylocity_id}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-[#8b8fa3]">
            <span>{emp.position || "No position"}</span>
            <span>·</span>
            <span>{emp.location || "No location"}</span>
            <span>·</span>
            <Badge variant="secondary">{emp.status}</Badge>
          </div>
        </div>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-medium">Training history</h2>
        <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2e3d] hover:bg-transparent">
                <TableHead className="text-[#8b8fa3]">Training</TableHead>
                <TableHead className="text-[#8b8fa3]">Completed</TableHead>
                <TableHead className="text-[#8b8fa3]">Expires</TableHead>
                <TableHead className="text-[#8b8fa3]">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(completions ?? []).length ? (
                (completions ?? []).map((c) => (
                  <TableRow key={`${c.completed_on}-${c.source}`} className="border-[#2a2e3d]">
                    <TableCell className="text-[#e8eaed]">
                      {typeName.get(c.training_type_id) ?? "Training"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.completed_on}</TableCell>
                    <TableCell className="font-mono text-xs">{c.expires_on ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-[#2a2e3d] text-[#8b8fa3]">
                        {c.source}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-[#8b8fa3]">
                    No completions yet. Import history or record a class.
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
