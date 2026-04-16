import Link from "next/link";
import { redirect } from "next/navigation";
import { createClassAction } from "@/app/actions/class";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewClassPage({
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
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: types } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .order("name");

  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button asChild variant="ghost" className="px-0 text-[#3b82f6]">
        <Link href="/classes">Back</Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Schedule class</h1>
      {sp.error ? <p className="text-sm text-[#ef4444]">{decodeURIComponent(sp.error)}</p> : null}
      <form action={createClassAction} className="space-y-4 rounded-xl border border-[#2a2e3d] bg-[#1e2230] p-6">
        <div className="space-y-2">
          <Label htmlFor="training_type_id">Training type</Label>
          <select
            id="training_type_id"
            name="training_type_id"
            required
            className="flex h-10 w-full rounded-md border border-[#2a2e3d] bg-[#0f1117] px-3 text-sm text-[#e8eaed]"
            defaultValue=""
          >
            <option value="" disabled>
              Choose training
            </option>
            {(types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduled_date">Date</Label>
          <Input id="scheduled_date" name="scheduled_date" type="date" required className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instructor">Instructor</Label>
          <Input id="instructor" name="instructor" className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input id="capacity" name="capacity" type="number" min={0} defaultValue={12} className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <Button type="submit" className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
          Save and open day view
        </Button>
      </form>
    </div>
  );
}
