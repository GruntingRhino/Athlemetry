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
  { href: "/privacy", label: "Privacy" },
] as const;
