import { notFound } from "next/navigation";
import { KioskSignInForm } from "@/components/training-hub/kiosk-sign-in-form";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export default async function PublicSignInPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;

  let org: { id: string; name: string } | null = null;
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: o } = await admin
      .from("organizations")
      .select("id, name")
      .eq("slug", org_slug.toLowerCase())
      .maybeSingle();
    org = o;
  } catch {
    notFound();
  }

  if (!org) notFound();

  return (
    <div className="min-h-screen px-4 py-10 bg-[--bg] text-[--ink]">
      <div className="mx-auto max-w-lg space-y-8">
        <header className="text-center">
          <p className="caption">Training sign-in</p>
          <h1 className="font-display mt-2 text-2xl font-medium">{org.name}</h1>
          <p className="text-sm text-[--ink-muted] mt-1">
            Select your training session and enter your name.
          </p>
        </header>
        <KioskSignInForm orgSlug={org_slug} />
      </div>
    </div>
  );
}
