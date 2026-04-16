"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GENERAL_HR_AUTH_EMAIL } from "@/lib/auth/general-hr";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: GENERAL_HR_AUTH_EMAIL,
        password,
      });
      if (signError) {
        setError(signError.message);
        setPending(false);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPending(false);
      return;
    }
    // Full navigation so the next document request includes auth cookies.
    // Server Actions + redirect() can drop Supabase cookies on Next.js 16 in some deployments.
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}
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
