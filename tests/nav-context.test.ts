import { describe, expect, it } from "vitest";

import { resolveActiveSport, resolveSportContext, sectionForPath } from "@/components/layout/nav-context";

describe("sectionForPath", () => {
  it("maps routes to header sections, treating /submissions/new as uploads", () => {
    expect(sectionForPath("/submissions/new")).toBe("uploads");
    expect(sectionForPath("/submissions")).toBe("submissions");
    expect(sectionForPath("/submissions/abc123")).toBe("submissions");
    expect(sectionForPath("/dashboard")).toBe("dashboard");
    expect(sectionForPath("/benchmarking")).toBe("benchmarking");
  });

  it("treats the drill list and capture guide as the drills section", () => {
    expect(sectionForPath("/drills")).toBe("drills");
    expect(sectionForPath("/protocols")).toBe("drills");
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

describe("resolveSportContext", () => {
  const sports = ["soccer", "baseball", "basketball"];

  it("returns the sport only when the URL names a known one, so no sport is active otherwise", () => {
    expect(resolveSportContext("baseball", sports)).toBe("baseball");
    expect(resolveSportContext(null, sports)).toBeNull();
    expect(resolveSportContext(undefined, sports)).toBeNull();
    expect(resolveSportContext("", sports)).toBeNull();
    expect(resolveSportContext("hockey", sports)).toBeNull();
  });
});
