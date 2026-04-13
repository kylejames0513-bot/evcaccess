import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "EVC Training Hub",
  description: "Emory Valley Center — Training Management System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body className="h-full bg-[#f8fafc] overflow-x-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
