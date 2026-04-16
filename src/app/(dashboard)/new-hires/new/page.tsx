import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NewHirePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  async function createNewHire(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    if (!firstName || !lastName) redirect("/new-hires/new?error=Name+required");

    const { data, error } = await supabase.from("new_hires").insert({
      legal_first_name: firstName,
      legal_last_name: lastName,
      preferred_name: String(formData.get("preferred_name") ?? "").trim() || null,
      position: String(formData.get("position") ?? "").trim() || null,
      department: String(formData.get("department") ?? "").trim() || null,
      supervisor_name_raw: String(formData.get("supervisor") ?? "").trim() || null,
      planned_start_date: String(formData.get("planned_start_date") ?? "").trim() || null,
      offer_accepted_date: String(formData.get("offer_accepted_date") ?? "").trim() || null,
      source: String(formData.get("source") ?? "").trim() || null,
      stage: "offer_accepted",
      ingest_source: "manual",
    }).select("id").single();

    if (error) redirect("/new-hires/new?error=" + encodeURIComponent(error.message));
    revalidatePath("/new-hires");
    redirect(`/new-hires/${data.id}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="caption">New record</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Start a new hire
        </h1>
      </div>
      <form action={createNewHire} className="max-w-xl space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="caption">First name</Label>
            <Input name="first_name" required className="border-[--rule] bg-[--surface]" />
          </div>
          <div className="space-y-1">
            <Label className="caption">Last name</Label>
            <Input name="last_name" required className="border-[--rule] bg-[--surface]" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="caption">Preferred name</Label>
          <Input name="preferred_name" className="border-[--rule] bg-[--surface]" placeholder="If different from legal first name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="caption">Position</Label>
            <Input name="position" className="border-[--rule] bg-[--surface]" />
          </div>
          <div className="space-y-1">
            <Label className="caption">Department</Label>
            <Input name="department" className="border-[--rule] bg-[--surface]" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="caption">Supervisor</Label>
          <Input name="supervisor" className="border-[--rule] bg-[--surface]" placeholder="Supervisor name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="caption">Offer accepted date</Label>
            <Input name="offer_accepted_date" type="date" className="border-[--rule] bg-[--surface]" />
          </div>
          <div className="space-y-1">
            <Label className="caption">Planned start date</Label>
            <Input name="planned_start_date" type="date" className="border-[--rule] bg-[--surface]" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="caption">Recruitment source</Label>
          <Input name="source" className="border-[--rule] bg-[--surface]" placeholder="Indeed, referral, etc." />
        </div>
        <Button type="submit" className="rounded-md bg-[--accent] text-white hover:bg-[--accent]/90">
          Create new hire
        </Button>
      </form>
    </div>
  );
}
