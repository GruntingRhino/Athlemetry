import type { Metadata } from "next";

import { Navigation } from "@/components/layout/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Athlemetry - Multi-sport video performance intelligence",
  description:
    "Structured multi-sport drill uploads, conservative metric extraction, and benchmark-ready athlete reporting for soccer, baseball, and basketball.",
  applicationName: "Athlemetry",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Athlemetry",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        <main className="athlemetry-shell">{children}</main>
      </body>
    </html>
  );
}
