import Link from "next/link";
import { createEmployeeAction } from "@/app/actions/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const err = sp.error;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Button asChild variant="ghost" className="mb-2 px-0 text-[#3b82f6]">
          <Link href="/employees">Back to roster</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Add employee</h1>
        <p className="text-sm text-[#8b8fa3]">Manual entry for one person. Bulk CSV lives on Imports.</p>
      </div>
      {err ? <p className="text-sm text-[#ef4444]">{decodeURIComponent(err)}</p> : null}
      <form action={createEmployeeAction} className="space-y-4 rounded-xl border border-[#2a2e3d] bg-[#1e2230] p-6">
        <div className="space-y-2">
          <Label htmlFor="paylocity_id">Paylocity ID</Label>
          <Input id="paylocity_id" name="paylocity_id" required className="border-[#2a2e3d] bg-[#0f1117] font-mono text-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" name="first_name" required className="border-[#2a2e3d] bg-[#0f1117]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last name</Label>
            <Input id="last_name" name="last_name" required className="border-[#2a2e3d] bg-[#0f1117]" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="position">Position</Label>
          <Input id="position" name="position" className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hire_date">Hire date</Label>
          <Input id="hire_date" name="hire_date" type="date" required className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <Button type="submit" className="rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
          Save employee
        </Button>
      </form>
    </div>
  );
}
