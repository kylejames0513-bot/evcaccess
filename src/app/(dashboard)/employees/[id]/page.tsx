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

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  const { data: completions } = await supabase
    .from("completions")
    .select("completed_on, expires_on, source, training_id, status")
    .eq("employee_id", id)
    .order("completed_on", { ascending: false });

  const typeIds = [...new Set((completions ?? []).map((c) => c.training_id))];
  const { data: typeRows } =
    typeIds.length > 0
      ? await supabase.from("trainings").select("id, title").in("id", typeIds)
      : { data: [] as { id: string; title: string }[] };
  const typeName = new Map((typeRows ?? []).map((t) => [t.id, t.title]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0" style={{ color: "var(--accent)" }}>
            <Link href="/employees">Back to roster</Link>
          </Button>
          <h1
            className="font-display text-2xl font-semibold tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            {emp.legal_first_name} {emp.legal_last_name}
          </h1>
          <p className="font-mono text-sm" style={{ color: "var(--ink-muted)" }}>
            {emp.employee_id}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm" style={{ color: "var(--ink-muted)" }}>
            <span>{emp.position || "No position"}</span>
            <span>&middot;</span>
            <span>{emp.location || "No location"}</span>
            <span>&middot;</span>
            <Badge variant="secondary">{emp.status}</Badge>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium" style={{ color: "var(--ink)" }}>
          Training history
        </h2>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--rule)" }}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent" style={{ borderColor: "var(--rule)" }}>
                <TableHead style={{ color: "var(--ink-muted)" }}>Training</TableHead>
                <TableHead style={{ color: "var(--ink-muted)" }}>Completed</TableHead>
                <TableHead style={{ color: "var(--ink-muted)" }}>Expires</TableHead>
                <TableHead style={{ color: "var(--ink-muted)" }}>Source</TableHead>
                <TableHead style={{ color: "var(--ink-muted)" }}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(completions ?? []).length ? (
                (completions ?? []).map((c, i) => (
                  <TableRow key={`${c.completed_on}-${c.source}-${i}`} style={{ borderColor: "var(--rule)" }}>
                    <TableCell style={{ color: "var(--ink)" }}>
                      {typeName.get(c.training_id) ?? "Training"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.completed_on ?? "\u2014"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.expires_on ?? "\u2014"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}>
                        {c.source ?? "\u2014"}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ color: "var(--ink-muted)" }}>{c.status}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center" style={{ color: "var(--ink-muted)" }}>
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
