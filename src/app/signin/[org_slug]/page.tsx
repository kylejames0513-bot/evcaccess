import { notFound } from "next/navigation";
import { KioskSignInForm } from "@/components/training-hub/kiosk-sign-in-form";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PublicSignInPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;

  let orgName: string | null = null;
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data } = await admin
      .from("organizations")
      .select("name")
      .eq("slug", org_slug.toLowerCase())
      .maybeSingle();
    orgName = data?.name ?? null;
  } catch {
    notFound();
  }

  if (!orgName) notFound();

  return (
    <div className="min-h-screen bg-[--bg] text-[--ink]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 10% 0%, rgba(67,56,202,0.05) 0%, transparent 50%), radial-gradient(ellipse at 90% 100%, rgba(4,120,87,0.04) 0%, transparent 40%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-lg px-5 py-10 space-y-5">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[--ink] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[--bg]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[--success] animate-pulse"
            />
            {orgName}
          </span>
          <h1 className="font-display mt-3 text-[28px] leading-tight tracking-tight text-[--ink]">
            Training Sign In
          </h1>
          <p className="mt-1 text-sm text-[--ink-muted]">
            HR Program Coordinator: Kyle Mahoney
          </p>
        </header>

        <KioskSignInForm />
      </div>
    </div>
  );
}
