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
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: rows } = await supabase
    .from("training_types")
    .select("id, name, category, expiration_months, is_required, archived, regulatory_source")
    .eq("org_id", profile.org_id)
    .order("name");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Training types</h1>
          <p className="text-sm text-[#8b8fa3]">Archive instead of delete. Requirements map positions to courses.</p>
        </div>
        {profile.role === "admin" ? (
          <Button asChild className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
            <Link href="/trainings/new">Add training type</Link>
          </Button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-[#2a2e3d] bg-[#1e2230]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2e3d] hover:bg-transparent">
              <TableHead className="text-[#8b8fa3]">Name</TableHead>
              <TableHead className="text-[#8b8fa3]">Category</TableHead>
              <TableHead className="text-[#8b8fa3]">Months</TableHead>
              <TableHead className="text-[#8b8fa3]">Required</TableHead>
              <TableHead className="text-[#8b8fa3]">Regulator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length ? (
              (rows ?? []).map((r) => (
                <TableRow key={r.id} className="border-[#2a2e3d]">
                  <TableCell className="font-medium text-[#e8eaed]">
                    <Link href={`/trainings/${r.id}`} className="text-[#3b82f6] hover:underline">
                      {r.name}
                    </Link>
                    {r.archived ? (
                      <Badge className="ml-2 bg-[#5c6078]/20 text-[#8b8fa3]">Archived</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-[#8b8fa3]">{r.category}</TableCell>
                  <TableCell className="font-mono text-xs text-[#e8eaed]">
                    {r.expiration_months ?? "—"}
                  </TableCell>
                  <TableCell>{r.is_required ? "Yes" : "No"}</TableCell>
                  <TableCell className="max-w-xs truncate text-[#8b8fa3]">{r.regulatory_source}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-[#8b8fa3]">
                  No training types yet. Admins can add the catalog here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
