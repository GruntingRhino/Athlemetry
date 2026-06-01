import { describe, expect, it } from "vitest";

import { buildAnalysisSummary } from "@/lib/analysis-summary";

describe("buildAnalysisSummary", () => {
  it("summarizes basketball clips with court-line context", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "basketball-form-capture",
        metadata: {
          sport: "basketball",
          cameraAngle: "side",
          clipQuality: "good",
          measurementDistanceFeet: 15,
        },
      },
      {
        shotTiming: 1.8,
        frameBasedDuration: 1.8,
        reliabilityScore: 88,
      } as never,
    );

    expect(summary.primaryLabel).toBe("Shot form timing");
    expect(summary.secondaryValue).toContain("Free-throw line");
    expect(summary.note).toContain("free-throw or three-point");
  });

  it("summarizes soccer sprint clips with field-line context", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "sprint-20m",
        metadata: {
          sport: "soccer",
          cameraAngle: "side",
          clipQuality: "good",
          measurementDistanceFeet: 65.6,
        },
      },
      {
        sprintTime: 4.12,
        frameBasedDuration: 4.12,
        reliabilityScore: 91,
      } as never,
    );

    expect(summary.primaryLabel).toBe("20m sprint time");
    expect(summary.secondaryValue).toContain("20m sprint line");
    expect(summary.note).toContain("Side or diagonal clips");
  });

  it("describes baseball pitch velocity using the regulation distance anchor", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "baseball-pitch-velocity",
        metadata: {
          sport: "baseball",
          cameraAngle: "open-side",
          clipQuality: "good",
          measurementDistanceFeet: 60.5,
        },
      },
      {
        frameBasedDuration: 0.42,
        reliabilityScore: 84,
      } as never,
    );

    expect(summary.primaryLabel).toBe("Pitch velocity estimate");
    expect(summary.primaryValue).toContain("mph");
    expect(summary.note).toContain("60.5 ft");
  });
});
