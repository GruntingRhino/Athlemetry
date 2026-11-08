import { describe, expect, it } from "vitest";

import { buildSportHref, getSettingsLinks } from "@/lib/sport-navigation";

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
