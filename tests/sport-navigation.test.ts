import { describe, expect, it } from "vitest";

import { buildSportHref, getSectionPath, getSettingsGroups, getSettingsLinks, SPORT_SECTION_LABELS } from "@/lib/sport-navigation";

describe("buildSportHref", () => {
  it("builds sport-specific workflow links", () => {
    expect(buildSportHref("uploads", "soccer")).toBe("/submissions/new?sport=soccer");
    expect(buildSportHref("dashboard", "baseball")).toBe("/dashboard?sport=baseball");
    expect(buildSportHref("benchmarking", "basketball")).toBe("/benchmarking?sport=basketball");
  });

  it("normalizes an unexpected sport to soccer", () => {
    expect(buildSportHref("submissions", "hockey" as never)).toBe("/submissions?sport=soccer");
  });
});

describe("primary sections", () => {
  it("builds drill links and exposes unscoped section paths", () => {
    expect(buildSportHref("drills", "basketball")).toBe("/drills?sport=basketball");
    expect(getSectionPath("dashboard")).toBe("/dashboard");
    expect(getSectionPath("drills")).toBe("/drills");
    expect(getSectionPath("uploads")).toBe("/submissions/new");
    expect(SPORT_SECTION_LABELS.uploads).toBe("Upload");
  });
});

describe("getSettingsGroups", () => {
  const headings = (role?: string | null) => getSettingsGroups(role).map((group) => group.heading);
  const hrefs = (role?: string | null) => getSettingsGroups(role).flatMap((group) => group.links.map((link) => link.href));

  it("groups links under Account, Reports & plans, and Privacy & legal", () => {
    expect(headings("ATHLETE")).toEqual(["Account", "Reports & plans", "Privacy & legal"]);
    const legal = getSettingsGroups("ATHLETE").find((group) => group.heading === "Privacy & legal");
    expect(legal?.links.map((link) => link.href)).toEqual(["/privacy", "/privacy-notice", "/terms"]);
  });

  it("moves Benchmarking, Reports, and Coaching plans into the menu and keeps each link once", () => {
    const all = hrefs("COACH");
    for (const href of ["/benchmarking", "/reports", "/coaching"]) expect(all).toContain(href);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps role filtering and loses no link versus the flat list", () => {
    expect(hrefs("ATHLETE")).toContain("/team-invitations");
    expect(hrefs("ATHLETE")).not.toContain("/teams");
    expect(hrefs("COACH")).toContain("/teams");
    expect(hrefs("COACH")).not.toContain("/team-invitations");
    for (const role of ["ATHLETE", "COACH", "ADMIN", null]) {
      expect([...hrefs(role)].sort()).toEqual(getSettingsLinks(role).map((link) => link.href).sort());
    }
  });
});

describe("getSettingsLinks", () => {
  const hrefs = (role?: string | null) => getSettingsLinks(role).map((link) => link.href);

  it("shows teams only to coaches and admins, invitations only to athletes", () => {
    expect(hrefs("ATHLETE")).toContain("/team-invitations");
    expect(hrefs("ATHLETE")).not.toContain("/teams");
    expect(hrefs("COACH")).toContain("/teams");
    expect(hrefs("COACH")).not.toContain("/team-invitations");
    expect(hrefs("ADMIN")).toContain("/teams");
    expect(hrefs("ADMIN")).not.toContain("/team-invitations");
    expect(hrefs(null)).not.toContain("/teams");
    expect(hrefs(undefined)).not.toContain("/team-invitations");
  });
});
