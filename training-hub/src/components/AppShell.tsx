"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AuthGuard from "@/components/AuthGuard";
import QuickRecord from "@/components/QuickRecord";

const PUBLIC_PATHS = ["/login", "/signin"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const [quickRecordOpen, setQuickRecordOpen] = useState(false);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="flex h-full">
        <Sidebar onQuickRecord={() => setQuickRecordOpen(true)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileNav onQuickRecord={() => setQuickRecordOpen(true)} />
          <main className="flex-1 overflow-y-auto px-6 py-5 lg:px-8">{children}</main>
        </div>
      </div>
      <QuickRecord isOpen={quickRecordOpen} onClose={() => setQuickRecordOpen(false)} />
    </AuthGuard>
  );
}
