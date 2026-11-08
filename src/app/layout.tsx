import type { Metadata } from "next";

import { Navigation } from "@/components/layout/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Athlemetry - Multi-sport video performance intelligence",
    template: "%s · Athlemetry",
  },
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-teal-800 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        <Navigation />
        <main id="main-content" tabIndex={-1} className="athlemetry-shell focus:outline-none">
          {children}
        </main>
      </body>
    </html>
  );
}
