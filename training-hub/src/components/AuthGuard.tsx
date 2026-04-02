"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Pages that don't require authentication
const PUBLIC_PATHS = ["/signin", "/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isPublic) {
      setChecking(false);
      setAuthenticated(true);
      return;
    }

    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setAuthenticated(true);
        } else {
          router.push("/login");
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => setChecking(false));
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
