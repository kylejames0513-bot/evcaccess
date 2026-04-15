"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AuthGuard from "@/components/AuthGuard";

const PUBLIC_PATHS = ["/login", "/signin"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileNav />
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-6 max-w-full bg-[#f8fafc]">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
