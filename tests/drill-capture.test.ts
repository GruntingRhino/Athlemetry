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

  it("uses a measured 10m lane and stationary side view for passing targets", () => {
    const profile = getDrillCaptureProfile({ slug: "passing-accuracy", sport: "soccer" });

    expect(profile.cameraAngle).toBe("side");
    expect(profile.measurementDistanceFeet).toBeCloseTo(32.8, 1);
    expect(profile.distanceLabel).toContain("Passing lane");
    expect(profile.distanceHelp).toContain("10 m");
  });

  it("uses a measured 5m service lane and diagonal view for first-touch control", () => {
    const profile = getDrillCaptureProfile({ slug: "first-touch-control", sport: "soccer" });

    expect(profile.cameraAngle).toBe("diagonal");
    expect(profile.measurementDistanceFeet).toBeCloseTo(16.4, 1);
    expect(profile.distanceLabel).toContain("First-touch service lane");
    expect(profile.distanceHelp).toContain("5 m");
  });

  it("uses a fixed diagonal mechanics lane with a visible plant marker", () => {
    const profile = getDrillCaptureProfile({ slug: "shooting-mechanics", sport: "soccer" });

    expect(profile.cameraAngle).toBe("diagonal");
    expect(profile.measurementDistanceFeet).toBeCloseTo(26.2, 1);
    expect(profile.distanceLabel).toContain("Mechanics lane");
    expect(profile.distanceHelp).toContain("plant marker");
  });

  it("uses a controlled open-side throwing lane with a visible plate marker and target", () => {
    const profile = getDrillCaptureProfile({ slug: "baseball-throwing-mechanics", sport: "baseball" });

    expect(profile.cameraAngle).toBe("open-side");
    expect(profile.measurementDistanceFeet).toBeCloseTo(32.8, 1);
    expect(profile.distanceLabel).toContain("Throwing lane");
    expect(profile.distanceHelp).toContain("plate marker");
    expect(profile.distanceHelp).toContain("target");
  });

  it("uses a measured diagonal movement route with a visible finish target", () => {
    const profile = getDrillCaptureProfile({ slug: "movement-efficiency", sport: "soccer" });

    expect(profile.cameraAngle).toBe("diagonal");
    expect(profile.measurementDistanceFeet).toBeCloseTo(19.7, 1);
    expect(profile.distanceLabel).toContain("Movement route");
    expect(profile.distanceHelp).toContain("finish target");
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
    expect(describeReferenceDistance("passing-accuracy", 32.8)).toContain("passing lane");
    expect(describeReferenceDistance("first-touch-control", 16.4)).toContain("first-touch service lane");
    expect(describeReferenceDistance("shooting-mechanics", 26.2)).toContain("shooting mechanics lane");
    expect(describeReferenceDistance("baseball-throwing-mechanics", 32.8)).toContain("throwing mechanics lane");
    expect(describeReferenceDistance("movement-efficiency", 19.7)).toContain("movement route");
  });
});
