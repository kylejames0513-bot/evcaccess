import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/training-hub/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link href="/settings" className="text-sm text-[#3b82f6] hover:underline">
        Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-[#8b8fa3]">Signed in as {user.email}</p>
      </div>
      <SignOutButton />
    </div>
  );
}
