import Link from "next/link";
import { redirect } from "next/navigation";
import { createTrainingTypeAction } from "@/app/actions/training-type";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewTrainingTypePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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
  if (profile?.role !== "admin") redirect("/trainings");

  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button asChild variant="ghost" className="px-0 text-[#3b82f6]">
        <Link href="/trainings">Back</Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Add training type</h1>
      {sp.error ? <p className="text-sm text-[#ef4444]">{decodeURIComponent(sp.error)}</p> : null}
      <form action={createTrainingTypeAction} className="space-y-4 rounded-xl border border-[#2a2e3d] bg-[#1e2230] p-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            name="category"
            placeholder="Safety, Clinical, Compliance"
            className="border-[#2a2e3d] bg-[#0f1117]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expiration_months">Expiration in months (blank if non expiring)</Label>
          <Input id="expiration_months" name="expiration_months" type="number" min={1} className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="regulatory_source">Regulatory reference</Label>
          <Input id="regulatory_source" name="regulatory_source" className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" className="border-[#2a2e3d] bg-[#0f1117]" rows={3} />
        </div>
        <Button type="submit" className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
          Save training type
        </Button>
      </form>
    </div>
  );
}
