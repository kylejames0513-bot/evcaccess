"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Pages that don't require authentication
const PUBLIC_PATHS = ["/login", "/signin"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Compute initial state from the current pathname so the effect
  // never has to synchronously setState for the "public page" case.
  // This is the pattern React 19 recommends for deriving state from
  // props/navigation without cascading renders.
  const isPublic = isPublicPath(pathname);
  const [checking, setChecking] = useState(!isPublic);
  const [authenticated, setAuthenticated] = useState(isPublic);

  useEffect(() => {
    if (isPublic) return; // no work to do on public pages

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth");
        const data = await res.json();
        if (cancelled) return;
        if (data.authenticated) {
          setAuthenticated(true);
        } else {
          router.push("/login");
        }
      } catch {
        if (cancelled) return;
        router.push("/login");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, isPublic, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!authenticated && !isPublic) return null;

  return <>{children}</>;
}
