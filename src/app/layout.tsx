import type { Metadata } from "next";

import { Navigation } from "@/components/layout/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Athlemetry - Multi-sport video performance intelligence",
  description:
    "Structured multi-sport drill uploads, conservative metric extraction, and benchmark-ready athlete reporting for soccer, baseball, and basketball.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[var(--background)] text-slate-900 antialiased">
        <Navigation />
        <main className="mx-auto w-full max-w-7xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
