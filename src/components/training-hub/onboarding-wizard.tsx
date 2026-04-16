"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrapOrgAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingWizard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await bootstrapOrgAction(fd);
    setPending(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-lg space-y-6 rounded-xl border border-[#2a2e3d] bg-[#1a1d27] p-8">
      <div>
        <h1 className="text-xl font-semibold">Set up your organization</h1>
        <p className="mt-1 text-sm text-[#8b8fa3]">
          This creates your tenant and makes you the admin. You can invite coordinators next.
        </p>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" name="name" required className="border-[#2a2e3d] bg-[#0f1117]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Public sign in URL slug</Label>
          <Input
            id="slug"
            name="slug"
            required
            placeholder="emory-valley"
            className="border-[#2a2e3d] bg-[#0f1117] font-mono text-sm"
          />
          <p className="text-xs text-[#5c6078]">Used at /signin/your-slug for kiosk QR links.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="regulator">Primary regulator label</Label>
          <Input
            id="regulator"
            name="regulator"
            placeholder="TN DIDD"
            className="border-[#2a2e3d] bg-[#0f1117]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fiscal_year_start_month">Fiscal year starts (month 1 to 12)</Label>
          <Input
            id="fiscal_year_start_month"
            name="fiscal_year_start_month"
            type="number"
            min={1}
            max={12}
            defaultValue={7}
            className="border-[#2a2e3d] bg-[#0f1117]"
          />
        </div>
        {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}
        <Button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]"
        >
          Save and continue
        </Button>
      </form>
    </div>
  );
}
