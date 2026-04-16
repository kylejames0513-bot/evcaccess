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

  const { data: runs } = await supabase
    .from("ingestion_runs")
    .select("id, source, started_at, finished_at, status, rows_processed, rows_inserted, rows_updated, rows_skipped, rows_unresolved, error_summary")
    .order("started_at", { ascending: false })
    .limit(40);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="font-display text-2xl font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Run log
        </h1>
        <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
          Ingestion runs and other batch jobs, newest first.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--rule)" }}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent" style={{ borderColor: "var(--rule)" }}>
              <TableHead style={{ color: "var(--ink-muted)" }}>Started</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Source</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Status</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Inserted</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Unresolved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runs ?? []).length ? (
              (runs ?? []).map((r) => (
                <TableRow key={r.id} style={{ borderColor: "var(--rule)" }}>
                  <TableCell className="font-mono text-xs" style={{ color: "var(--ink)" }}>
                    {r.started_at}
                  </TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{r.source}</TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{r.status}</TableCell>
                  <TableCell style={{ color: "var(--ink)" }}>{r.rows_inserted}</TableCell>
                  <TableCell style={{ color: "var(--ink)" }}>{r.rows_unresolved}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center" style={{ color: "var(--ink-muted)" }}>
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
