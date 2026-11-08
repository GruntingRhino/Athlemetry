import { describe, expect, it } from "vitest";

import { resolveActiveSport, sectionForPath } from "@/components/layout/nav-context";

describe("sectionForPath", () => {
  it("maps routes to header sections, treating /submissions/new as uploads", () => {
    expect(sectionForPath("/submissions/new")).toBe("uploads");
    expect(sectionForPath("/submissions")).toBe("submissions");
    expect(sectionForPath("/submissions/abc123")).toBe("submissions");
    expect(sectionForPath("/dashboard")).toBe("dashboard");
    expect(sectionForPath("/benchmarking")).toBe("benchmarking");
  });

  it("returns null for pages outside the primary sections", () => {
    expect(sectionForPath("/profile")).toBeNull();
    expect(sectionForPath("/submissions-archive")).toBeNull();
    expect(sectionForPath("/")).toBeNull();
  });
});

describe("resolveActiveSport", () => {
  const sports = ["soccer", "baseball", "basketball"];

  it("accepts a known sport and falls back to the default otherwise", () => {
    expect(resolveActiveSport("baseball", sports)).toBe("baseball");
    expect(resolveActiveSport("hockey", sports)).toBe("soccer");
    expect(resolveActiveSport(null, sports)).toBe("soccer");
  });
});
