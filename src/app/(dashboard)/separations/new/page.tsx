import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSeparationAction } from "@/app/actions/separation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NewSeparationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;

  return (
    <div className="space-y-8">
      <div>
        <p className="caption">New record</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Log a separation
        </h1>
        <p className="mt-2 text-sm text-[--ink-soft]">
          Saved to the hub. Run <code className="font-mono text-xs">npm run writeback:separations</code> locally to apply to <code className="font-mono text-xs">FY Separation Summary.xlsx</code>.
        </p>
      </div>

      {sp.error ? (
        <div className="rounded-md border border-[--alert]/30 bg-[--alert-soft] px-4 py-3 text-sm text-[--alert]">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <form action={createSeparationAction} className="max-w-xl space-y-6">
        <div className="space-y-1">
          <Label className="caption">Employee name (Last, First)</Label>
          <Input name="legal_name" required className="border-[--rule] bg-[--surface]" placeholder="Doe, Jane" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="caption">Position</Label>
            <Input name="position" className="border-[--rule] bg-[--surface]" />
          </div>
          <div className="space-y-1">
            <Label className="caption">Department</Label>
            <Input name="department" className="border-[--rule] bg-[--surface]" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="caption">Hire date</Label>
            <Input name="hire_date" type="date" className="border-[--rule] bg-[--surface]" />
          </div>
          <div className="space-y-1">
            <Label className="caption">Separation date</Label>
            <Input name="separation_date" type="date" required className="border-[--rule] bg-[--surface]" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Label className="caption">Supervisor</Label>
          <Input name="supervisor_name_raw" className="border-[--rule] bg-[--surface]" placeholder="Name as listed on the roster" />
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
