import { normalizeSport } from "@/lib/drills";

export type SportSectionKey = "uploads" | "submissions" | "dashboard" | "drills" | "benchmarking";

export const SPORT_SECTION_LABELS: Record<SportSectionKey, string> = {
  uploads: "Upload",
  submissions: "Submissions",
  dashboard: "Dashboard",
  drills: "Drills",
  benchmarking: "Benchmarking",
};

const SPORT_SECTION_PATHS: Record<SportSectionKey, string> = {
  uploads: "/submissions/new",
  submissions: "/submissions",
  dashboard: "/dashboard",
  drills: "/drills",
  benchmarking: "/benchmarking",
};

/** The section's own path with no sport context (used when the current URL is not sport-scoped). */
export function getSectionPath(section: SportSectionKey) {
  return SPORT_SECTION_PATHS[section];
}

export function buildSportHref(section: SportSectionKey, sport?: string | null) {
  return `${SPORT_SECTION_PATHS[section]}?sport=${normalizeSport(sport)}`;
}

export const SPORT_SETTINGS_LINKS = [
  { href: "/profile", label: "Profile" },
  { href: "/teams", label: "Teams" },
  { href: "/team-invitations", label: "Team invitations" },
  { href: "/billing", label: "Billing" },
  { href: "/benchmarking", label: "Benchmarking" },
  { href: "/reports", label: "Reports" },
  { href: "/coaching", label: "Coaching plans" },
  { href: "/feedback", label: "Feedback history" },
  { href: "/shared", label: "Shared with you" },
  { href: "/protocols", label: "Capture guide" },
  { href: "/privacy", label: "Privacy controls" },
  { href: "/privacy-notice", label: "Privacy notice" },
  { href: "/terms", label: "Terms of use" },
] as const;

/** Settings links visible to a role: teams for COACH/ADMIN, team invitations for ATHLETE only. */
export function getSettingsLinks(role?: string | null) {
  return SPORT_SETTINGS_LINKS.filter((link) => {
    if (link.href === "/teams") return role === "COACH" || role === "ADMIN";
    if (link.href === "/team-invitations") return role === "ATHLETE";
    return true;
  });
}

const SETTINGS_GROUP_HREFS: ReadonlyArray<{ heading: string; hrefs: ReadonlyArray<string> }> = [
  { heading: "Account", hrefs: ["/profile", "/teams", "/team-invitations", "/billing"] },
  {
    heading: "Reports & plans",
    hrefs: ["/benchmarking", "/reports", "/coaching", "/feedback", "/shared", "/protocols"],
  },
  { heading: "Privacy & legal", hrefs: ["/privacy", "/privacy-notice", "/terms"] },
];

/** Role-filtered settings links under small headings; empty groups are dropped. */
export function getSettingsGroups(role?: string | null) {
  const visible = getSettingsLinks(role);
  return SETTINGS_GROUP_HREFS.map((group) => ({
    heading: group.heading,
    links: group.hrefs.flatMap((href) => visible.filter((link) => link.href === href)),
  })).filter((group) => group.links.length > 0);
}
