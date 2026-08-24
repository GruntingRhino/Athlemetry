import { normalizeSport } from "@/lib/drills";

export type SportSectionKey = "uploads" | "submissions" | "dashboard" | "benchmarking";

export const SPORT_SECTION_LABELS: Record<SportSectionKey, string> = {
  uploads: "Uploads",
  submissions: "Submissions",
  dashboard: "Dashboard",
  benchmarking: "Benchmarking",
};

const SPORT_SECTION_PATHS: Record<SportSectionKey, string> = {
  uploads: "/submissions/new",
  submissions: "/submissions",
  dashboard: "/dashboard",
  benchmarking: "/benchmarking",
};

export function buildSportHref(section: SportSectionKey, sport?: string | null) {
  return `${SPORT_SECTION_PATHS[section]}?sport=${normalizeSport(sport)}`;
}

export const SPORT_SETTINGS_LINKS = [
  { href: "/profile", label: "Profile" },
  { href: "/coaching", label: "Coaching plans" },
  { href: "/teams", label: "Teams" },
  { href: "/team-invitations", label: "Team invitations" },
  { href: "/feedback", label: "Feedback history" },
  { href: "/shared", label: "Shared with you" },
  { href: "/protocols", label: "Drill protocols" },
  { href: "/billing", label: "Billing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/privacy-notice", label: "Privacy Notice" },
  { href: "/terms", label: "Terms of Use" },
] as const;
