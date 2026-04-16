import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NewSeparationPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  async function createSeparation(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const legalName = String(formData.get("legal_name") ?? "").trim();
    const separationDate = String(formData.get("separation_date") ?? "").trim();
    if (!legalName || !separationDate) redirect("/separations/new?error=Name+and+date+required");

    const { error } = await supabase.from("separations").insert({
      legal_name: legalName,
      position: String(formData.get("position") ?? "").trim() || null,
      department: String(formData.get("department") ?? "").trim() || null,
      hire_date: String(formData.get("hire_date") ?? "").trim() || null,
      separation_date: separationDate,
      separation_type: String(formData.get("separation_type") ?? "voluntary") as "voluntary" | "involuntary" | "other",
      reason_primary: String(formData.get("reason_primary") ?? "").trim() || null,
      rehire_eligible: String(formData.get("rehire_eligible") ?? "conditional") as "yes" | "no" | "conditional",
      exit_interview_status: String(formData.get("exit_interview_status") ?? "not_done") as "completed" | "declined" | "not_done",
      hr_notes: String(formData.get("hr_notes") ?? "").trim() || null,
      ingest_source: "manual",
    });

    if (error) redirect("/separations/new?error=" + encodeURIComponent(error.message));
    revalidatePath("/separations");
    redirect("/separations");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="caption">New record</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Log a separation
        </h1>
      </div>
      <form action={createSeparation} className="max-w-xl space-y-6">
        <div className="space-y-1">
          <Label className="caption">Employee name (Last, First)</Label>
          <Input name="legal_name" required className="border-[--rule] bg-[--surface]" placeholder="Doe, Jane" />
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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="caption">Hire date</Label>
            <Input name="hire_date" type="date" className="border-[--rule] bg-[--surface]" />
          </div>
          <div className="space-y-1">
            <Label className="caption">Separation date</Label>
            <Input name="separation_date" type="date" required className="border-[--rule] bg-[--surface]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="caption">Separation type</Label>
            <select name="separation_type" className="w-full rounded-md border border-[--rule] bg-[--surface] px-3 py-2 text-sm">
              <option value="voluntary">Voluntary</option>
              <option value="involuntary">Involuntary</option>
              <option value="layoff">Layoff</option>
              <option value="retirement">Retirement</option>
              <option value="end_of_contract">End of Contract</option>
              <option value="job_abandonment">Job Abandonment</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="caption">Eligible for rehire</Label>
            <select name="rehire_eligible" className="w-full rounded-md border border-[--rule] bg-[--surface] px-3 py-2 text-sm">
              <option value="conditional">Conditional</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="caption">Reason</Label>
          <Input name="reason_primary" className="border-[--rule] bg-[--surface]" placeholder="Primary reason for departure" />
        </div>
        <div className="space-y-1">
          <Label className="caption">Exit interview</Label>
          <select name="exit_interview_status" className="w-full rounded-md border border-[--rule] bg-[--surface] px-3 py-2 text-sm">
            <option value="not_done">Not done</option>
            <option value="completed">Completed</option>
            <option value="declined">Declined</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="caption">HR notes</Label>
          <textarea name="hr_notes" rows={3} className="w-full rounded-md border border-[--rule] bg-[--surface] px-3 py-2 text-sm" />
        </div>
        <Button type="submit" className="rounded-md bg-[--accent] text-white hover:bg-[--accent]/90">
          Save separation
        </Button>
      </form>
    </div>
  );
}
