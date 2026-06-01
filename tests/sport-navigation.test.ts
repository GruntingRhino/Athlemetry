import { describe, expect, it } from "vitest";

import { buildSportHref } from "@/lib/sport-navigation";

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
