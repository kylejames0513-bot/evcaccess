"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  password: z.string().min(8),
});

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setMessage(null);
    const res = await fetch("/api/auth/hr-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: values.password }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Could not sign in.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="password">HR password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="border-[#2a2e3d] bg-[#0f1117]"
          {...form.register("password")}
        />
      </div>
      {message ? <p className="text-sm text-[#ef4444]">{message}</p> : null}
      <Button type="submit" className="w-full rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb]">
        Enter
      </Button>
    </form>
  );
}
