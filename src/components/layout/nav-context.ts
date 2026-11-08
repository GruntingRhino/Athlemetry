// Client-safe helpers for the header. Keep this file free of server-only imports
// (src/lib/sport-navigation.ts pulls in Prisma through src/lib/drills.ts).

export type NavSectionKey = "uploads" | "submissions" | "dashboard" | "benchmarking";

export function sectionForPath(pathname: string): NavSectionKey | null {
  if (pathname === "/submissions/new" || pathname.startsWith("/submissions/new/")) return "uploads";
  if (pathname === "/submissions" || pathname.startsWith("/submissions/")) return "submissions";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "dashboard";
  if (pathname === "/benchmarking" || pathname.startsWith("/benchmarking/")) return "benchmarking";
  return null;
}

/** Returns the requested sport when it is allowed, otherwise the first (default) sport. */
export function resolveActiveSport(param: string | null | undefined, sports: ReadonlyArray<string>): string {
  return param && sports.includes(param) ? param : sports[0];
}
