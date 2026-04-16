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
import { Badge } from "@/components/ui/badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TrainingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("trainings")
    .select("id, code, title, category, cadence_type, cadence_months, active, regulatory_citation")
    .order("title");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="font-display text-2xl font-semibold tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            Trainings
          </h1>
          <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
            Deactivate instead of delete. Requirements map roles to courses.
          </p>
        </div>
        {profile?.role === "admin" ? (
          <Button asChild className="rounded-lg text-white" style={{ backgroundColor: "var(--accent)" }}>
            <Link href="/trainings/new">Add training</Link>
          </Button>
        ) : null}
      </div>
      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--rule)", backgroundColor: "var(--surface)" }}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent" style={{ borderColor: "var(--rule)" }}>
              <TableHead style={{ color: "var(--ink-muted)" }}>Code</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Title</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Category</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Cadence</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Months</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Citation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length ? (
              (rows ?? []).map((r) => (
                <TableRow key={r.id} style={{ borderColor: "var(--rule)" }}>
                  <TableCell className="font-mono text-xs" style={{ color: "var(--ink)" }}>
                    <Link href={`/trainings/${r.id}`} style={{ color: "var(--accent)" }} className="hover:underline">
                      {r.code}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium" style={{ color: "var(--ink)" }}>
                    {r.title}
                    {!r.active ? (
                      <Badge className="ml-2 bg-[#5c6078]/20 text-[#8b8fa3]">Inactive</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{r.category ?? "\u2014"}</TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{r.cadence_type}</TableCell>
                  <TableCell className="font-mono text-xs" style={{ color: "var(--ink)" }}>
                    {r.cadence_months ?? "\u2014"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" style={{ color: "var(--ink-muted)" }}>
                    {r.regulatory_citation ?? "\u2014"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center" style={{ color: "var(--ink-muted)" }}>
                  No trainings yet. Admins can add the catalog here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
