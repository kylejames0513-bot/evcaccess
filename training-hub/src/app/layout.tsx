import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export const metadata: Metadata = {
  title: "EVC Training Hub",
  description: "Emory Valley Center — Training Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="h-full bg-[#f1f5f9]">
        <div className="flex h-full">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MobileNav />
            <main className="flex-1 overflow-y-auto px-6 py-5 lg:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
