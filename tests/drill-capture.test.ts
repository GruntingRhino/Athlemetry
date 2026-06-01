import { describe, expect, it } from "vitest";

import { describeReferenceDistance, getDrillCaptureProfile } from "@/lib/drill-capture";

describe("getDrillCaptureProfile", () => {
  it("defaults baseball pitch velocity to a 60.5 ft open-side setup", () => {
    const profile = getDrillCaptureProfile({ slug: "baseball-pitch-velocity", sport: "baseball" });

    expect(profile.cameraAngle).toBe("open-side");
    expect(profile.measurementDistanceFeet).toBe(60.5);
    expect(profile.distanceLabel).toContain("Batting");
  });

  it("defaults basketball form capture to free-throw line calibration", () => {
    const profile = getDrillCaptureProfile({ slug: "basketball-form-capture", sport: "basketball" });

    expect(profile.cameraAngle).toBe("side");
    expect(profile.measurementDistanceFeet).toBe(15);
    expect(profile.distanceLabel).toContain("Court reference");
  });

  it("defaults soccer sprint capture to the 20m line", () => {
    const profile = getDrillCaptureProfile({ slug: "sprint-20m", sport: "soccer" });

    expect(profile.cameraAngle).toBe("side");
    expect(profile.measurementDistanceFeet).toBeCloseTo(65.6, 1);
    expect(profile.distanceHelp).toContain("20m");
  });
});

describe("describeReferenceDistance", () => {
  it("renders familiar basketball line labels", () => {
    expect(describeReferenceDistance("basketball-form-capture", 15)).toBe("Free-throw line (15 ft)");
    expect(describeReferenceDistance("basketball-form-capture", 23.75)).toBe("Three-point arc (23.75 ft)");
  });

  it("renders baseball and soccer distance labels", () => {
    expect(describeReferenceDistance("baseball-pitch-velocity", 60.5)).toContain("Regulation pitching distance");
    expect(describeReferenceDistance("sprint-20m", 65.6)).toContain("20m sprint");
  });
});
