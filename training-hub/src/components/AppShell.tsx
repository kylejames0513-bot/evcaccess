"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AuthGuard from "@/components/AuthGuard";

const PUBLIC_PATHS = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // No sidebar, no auth check for sign-in and login pages
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileNav />
          <main className="flex-1 overflow-y-auto px-6 py-5 lg:px-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
