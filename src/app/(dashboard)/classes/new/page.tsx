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

  const { data: types } = await supabase
    .from("trainings")
    .select("id, title")
    .eq("active", true)
    .order("title");

  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button asChild variant="ghost" className="px-0" style={{ color: "var(--accent)" }}>
        <Link href="/classes">Back</Link>
      </Button>
      <h1 className="font-display text-2xl font-semibold tracking-tight" style={{ color: "var(--ink)" }}>
        Schedule class
      </h1>
      {sp.error ? <p className="text-sm text-[#ef4444]">{decodeURIComponent(sp.error)}</p> : null}
      <form
        action={createClassAction}
        className="space-y-4 rounded-xl border p-6"
        style={{ borderColor: "var(--rule)", backgroundColor: "var(--surface)" }}
      >
        <div className="space-y-2">
          <Label htmlFor="training_id">Training</Label>
          <select
            id="training_id"
            name="training_id"
            required
            className="flex h-10 w-full rounded-md border px-3 text-sm"
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--bg)", color: "var(--ink)" }}
            defaultValue=""
          >
            <option value="" disabled>
              Choose training
            </option>
            {(types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduled_start">Date</Label>
          <Input
            id="scheduled_start"
            name="scheduled_start"
            type="date"
            required
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--bg)" }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--bg)" }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trainer_name">Instructor</Label>
          <Input
            id="trainer_name"
            name="trainer_name"
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--bg)" }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={0}
            defaultValue={12}
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--bg)" }}
          />
        </div>
        <Button type="submit" className="rounded-lg text-white" style={{ backgroundColor: "var(--accent)" }}>
          Save and open day view
        </Button>
      </form>
    </div>
  );
}
