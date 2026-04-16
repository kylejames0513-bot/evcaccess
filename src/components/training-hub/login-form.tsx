"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hrPasswordLoginAction } from "@/app/actions/hr-login";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(hrPasswordLoginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">HR password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="border-[#2a2e3d] bg-[#0f1117]"
        />
      </div>
      {state?.error ? <p className="text-sm text-[#ef4444]">{state.error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Enter"}
      </Button>
    </form>
  );
}
