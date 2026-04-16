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

export default async function ReviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: itemsRaw } = await supabase
    .from("review_queue")
    .select(
      "id, source, reason, raw_payload, suggested_match_employee_id, suggested_match_score, resolved, resolved_at, created_at",
    )
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = (itemsRaw ?? []) as {
    id: string;
    source: string | null;
    reason: string | null;
    raw_payload: Record<string, unknown> | null;
    suggested_match_employee_id: string | null;
    suggested_match_score: number | null;
    resolved: boolean;
    resolved_at: string | null;
    created_at: string;
  }[];

  return (
    <div className="space-y-10">
      <div>
        <h1
          className="font-display text-2xl font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Review queue
        </h1>
        <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
          Resolve items so nothing silently drops. {items.length} unresolved.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--rule)" }}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent" style={{ borderColor: "var(--rule)" }}>
              <TableHead style={{ color: "var(--ink-muted)" }}>Created</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Source</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Reason</TableHead>
              <TableHead style={{ color: "var(--ink-muted)" }}>Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length ? (
              items.map((item) => (
                <TableRow key={item.id} style={{ borderColor: "var(--rule)" }}>
                  <TableCell className="font-mono text-xs" style={{ color: "var(--ink)" }}>
                    {item.created_at}
                  </TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{item.source ?? "\u2014"}</TableCell>
                  <TableCell style={{ color: "var(--ink-muted)" }}>{item.reason ?? "\u2014"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.suggested_match_score != null
                      ? item.suggested_match_score.toFixed(2)
                      : "\u2014"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center" style={{ color: "var(--ink-muted)" }}>
                  Queue is clear. Nice work.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
