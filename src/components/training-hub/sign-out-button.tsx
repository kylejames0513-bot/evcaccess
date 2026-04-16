"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="border-[#2a2e3d]"
      onClick={async () => {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
