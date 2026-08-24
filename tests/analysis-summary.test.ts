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

  it("withholds free-throw accuracy until independently validated outcome evidence exists", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "basketball-free-throw",
        metadata: { sport: "basketball", cameraAngle: "diagonal", clipQuality: "good", measurementDistanceFeet: 15 },
      },
      { accuracyScore: 100, reliabilityScore: 99 } as never,
    );

    expect(summary.primaryValue).toBe("Unavailable pending validated outcome evidence");
    expect(summary.note).toContain("not a made-shot percentage");
  });

  it("withholds lane-agility timing until route evidence is validated", () => {
    const summary = buildAnalysisSummary(
      { drillType: "basketball-lane-agility", metadata: { sport: "basketball", cameraAngle: "diagonal", clipQuality: "good", measurementDistanceFeet: 47 } },
      { changeOfDirectionMeasurement: 10.1, reliabilityScore: 99 } as never,
    );

    expect(summary.primaryValue).toBe("Unavailable pending validated route evidence");
    expect(summary.note).toContain("not a timing measurement");
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

  it("summarizes passing only as a protocol-defined target outcome", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "passing-accuracy",
        metadata: {
          sport: "soccer",
          cameraAngle: "side",
          clipQuality: "good",
          measurementDistanceFeet: 32.8,
        },
      },
      { accuracyScore: 80, reliabilityScore: 88 } as never,
    );

    expect(summary.primaryLabel).toBe("Passing target accuracy");
    expect(summary.primaryValue).toBe("80.0 / 100");
    expect(summary.secondaryValue).toContain("passing lane");
    expect(summary.note).toContain("independently verified target outcomes");
  });

  it("summarizes shooting mechanics without an accuracy or coaching claim", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "shooting-mechanics",
        metadata: {
          sport: "soccer",
          cameraAngle: "diagonal",
          clipQuality: "good",
          measurementDistanceFeet: 26.2,
        },
      },
      { techniqueScore: 80, reliabilityScore: 88 } as never,
    );

    expect(summary.primaryLabel).toBe("Shooting mechanics capture");
    expect(summary.primaryValue).toBe("80.0 / 100");
    expect(summary.secondaryValue).toContain("shooting mechanics lane");
    expect(summary.note).toContain("not a coaching or shot-quality claim");
    expect(JSON.stringify(summary)).not.toMatch(/accuracy/i);
  });

  it("withholds baseball throwing-mechanics output without performance, health, coaching, or accuracy claims", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "baseball-throwing-mechanics",
        metadata: {
          sport: "baseball",
          cameraAngle: "open-side",
          clipQuality: "good",
          measurementDistanceFeet: 32.8,
        },
      },
      { techniqueScore: 80, reliabilityScore: 88 } as never,
    );

    expect(summary.primaryLabel).toBe("Throwing-mechanics capture");
    expect(summary.primaryValue).toBe("Unavailable");
    expect(summary.secondaryValue).toContain("throwing mechanics lane");
    expect(summary.note).toContain("current capture and release gates");
    expect(JSON.stringify(summary)).not.toMatch(/performance|health|coaching|accuracy|velocity/i);
  });

  it("summarizes movement efficiency as capture evidence without a performance claim", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "movement-efficiency",
        metadata: {
          sport: "soccer",
          cameraAngle: "diagonal",
          clipQuality: "good",
          measurementDistanceFeet: 19.7,
        },
      },
      { consistencyScore: 80, reliabilityScore: 88 } as never,
    );

    expect(summary.primaryLabel).toBe("Movement-route capture");
    expect(summary.primaryValue).toBe("80.0 / 100");
    expect(summary.secondaryValue).toContain("movement route");
    expect(summary.note).toContain("not an efficiency, coaching, or scientific claim");
  });

  it("discloses automatic marker calibration and confidence", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "sprint-20m",
        metadata: {
          sport: "soccer",
          visionAnalysis: {
            evidence: {
              calibration_method: "aruco-course-markers",
              calibration_confidence: 0.75,
              calibration_marker_observations: 6,
            },
          },
        },
      },
      { sprintTime: 3.2, reliabilityScore: 75 } as never,
    );

    expect(summary.note).toContain("Automatic start/finish marker timing");
    expect(summary.note).toContain("75%");
    expect(summary.note).toContain("6 frames");
  });

  it("does not derive baseball pitch velocity from user-entered distance and frame timing", () => {
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

    expect(summary.primaryLabel).toBe("Release-to-target timing");
    expect(summary.primaryValue).toBe("0.420s");
    expect(summary.note).toContain("Velocity is withheld");
    expect(JSON.stringify(summary)).not.toContain("mph");
  });

  it("surfaces an independently produced pitch speed without recomputing it from timing", () => {
    const summary = buildAnalysisSummary(
      {
        drillType: "baseball-pitch-velocity",
        metadata: { sport: "baseball", measurementDistanceFeet: 60.5 },
      },
      { frameBasedDuration: 0.42, speed: 40.3, reliabilityScore: 88 } as never,
    );

    expect(summary.primaryLabel).toBe("Calibrated pitch speed");
    expect(summary.primaryValue).toBe("40.30 m/s");
    expect(summary.secondaryValue).toBe("0.420s");
  });
});
