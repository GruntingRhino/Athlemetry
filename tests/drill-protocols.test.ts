import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STANDARD_DRILLS } from "@/lib/constants";
import { resolveSelectedDrillSlug } from "@/lib/drills";
import {
  DRILL_PROTOCOLS,
  evaluateMetricRelease,
  type MetricValidationEvidence,
} from "@/lib/drill-protocols";

describe("standardized drill protocols and release gates", () => {
  it("defines a versioned protocol and ground-truth method for every customer drill", () => {
    expect(Object.keys(DRILL_PROTOCOLS).sort()).toEqual(
      STANDARD_DRILLS.map((drill) => drill.slug).sort(),
    );
    for (const protocol of Object.values(DRILL_PROTOCOLS)) {
      expect(protocol.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(protocol.setup.length).toBeGreaterThan(2);
      expect(protocol.camera.acceptedAngles.length).toBeGreaterThan(0);
      expect(protocol.groundTruth.equipment.length).toBeGreaterThan(0);
      expect(protocol.groundTruth.expertReviewers).toBeGreaterThanOrEqual(2);
      expect(protocol.metrics.length).toBeGreaterThan(0);
    }
  });

  it("can persist every declared customer-facing primary metric", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const metricResult = schema.match(/model MetricResult \{([\s\S]*?)\n\}/)?.[1] ?? "";
    for (const drill of STANDARD_DRILLS) {
      expect(metricResult, `${drill.slug} primary metric ${drill.metricPrimaryKey} is not persisted`)
        .toMatch(new RegExp(`\\b${drill.metricPrimaryKey}\\s+`));
    }
  });

  it("treats calibrated speed—not user-marked travel timing—as the pitch-velocity result", () => {
    const pitchVelocity = STANDARD_DRILLS.find((drill) => drill.slug === "baseball-pitch-velocity");

    expect(pitchVelocity?.metricPrimaryKey).toBe("speed");
    expect(pitchVelocity?.description).toContain("withheld");
  });

  it("defines a first-touch control protocol with a distinct cone-and-target recognition contract", () => {
    const firstTouch = STANDARD_DRILLS.find((drill) => drill.slug === "first-touch-control");
    const protocol = DRILL_PROTOCOLS["first-touch-control"];

    expect(firstTouch).toMatchObject({
      sport: "soccer",
      metricPrimaryKey: "accuracyScore",
      lowerIsBetter: false,
    });
    expect(protocol.camera).toMatchObject({
      minimumFps: 60,
      fullBodyRequired: true,
    });
    expect(protocol.setup.join(" ")).toContain("5.00 m");
    expect(protocol.setup.join(" ")).toContain("control square");
    expect(protocol.metrics.map((metric) => metric.key)).toContain("accuracyScore");
  });

  it("defines a soccer shooting-mechanics capture as a versioned, non-accuracy protocol", () => {
    const mechanics = STANDARD_DRILLS.find((drill) => drill.slug === "shooting-mechanics");
    const protocol = DRILL_PROTOCOLS["shooting-mechanics"];

    expect(mechanics).toMatchObject({
      sport: "soccer",
      metricPrimaryKey: "techniqueScore",
      lowerIsBetter: false,
    });
    expect(mechanics?.name).toContain("mechanics");
    expect(mechanics?.description).not.toMatch(/accuracy/i);
    expect(protocol.camera).toMatchObject({
      acceptedAngles: ["diagonal", "side"],
      minimumFps: 60,
      fullBodyRequired: true,
    });
    expect(protocol.setup.join(" ")).toContain("plant marker");
    expect(protocol.metrics.map((metric) => metric.key)).not.toContain("accuracyScore");
    expect(protocol.metrics.map((metric) => metric.key)).toContain("techniqueScore");
  });

  it("defines baseball throwing mechanics as a versioned controlled capture without a performance or accuracy metric", () => {
    const mechanics = STANDARD_DRILLS.find((drill) => drill.slug === "baseball-throwing-mechanics");
    const protocol = DRILL_PROTOCOLS["baseball-throwing-mechanics"];

    expect(mechanics).toMatchObject({
      sport: "baseball",
      metricPrimaryKey: "techniqueScore",
      lowerIsBetter: false,
    });
    expect(mechanics?.name).toContain("Throwing mechanics");
    expect(mechanics?.description).not.toMatch(/accuracy|velocity|performance|health|coaching/i);
    expect(protocol.camera).toMatchObject({
      acceptedAngles: ["open-side", "diagonal"],
      minimumFps: 60,
      fullBodyRequired: true,
    });
    expect(protocol.setup.join(" ")).toContain("10.00 m");
    expect(protocol.setup.join(" ")).toContain("home-plate marker");
    expect(protocol.metrics.map((metric) => metric.key)).not.toContain("accuracyScore");
    expect(protocol.metrics.map((metric) => metric.key)).toContain("techniqueScore");
  });

  it("defines a soccer movement-efficiency capture as a versioned, non-scientific route protocol", () => {
    const movement = STANDARD_DRILLS.find((drill) => drill.slug === "movement-efficiency");
    const protocol = DRILL_PROTOCOLS["movement-efficiency"];

    expect(movement).toMatchObject({
      sport: "soccer",
      metricPrimaryKey: "consistencyScore",
      lowerIsBetter: false,
    });
    expect(movement?.description).not.toMatch(/score|accuracy|scientific/i);
    expect(protocol.camera).toMatchObject({
      acceptedAngles: ["diagonal", "overhead"],
      minimumFps: 60,
      fullBodyRequired: true,
    });
    expect(protocol.setup.join(" ")).toContain("6.00 m");
    expect(protocol.setup.join(" ")).toContain("numbered finish target");
    expect(protocol.metrics.map((metric) => metric.key)).not.toContain("accuracyScore");
    expect(protocol.metrics.map((metric) => metric.key)).toContain("consistencyScore");
  });

  it("declares a separately reviewed coaching-recommendation release gate for every drill", () => {
    for (const [slug, protocol] of Object.entries(DRILL_PROTOCOLS)) {
      const gate = protocol.metrics.find((metric) => metric.key === "coachingRecommendations");
      expect(gate, `${slug} is missing its coaching recommendation gate`).toMatchObject({
        unit: "expert_consensus",
        minimumSampleSize: 100,
        maximumP90Error: 0,
      });
    }
  });

  it("requires at least 100 permission-cleared expert-reviewed examples to release coaching recommendations", () => {
    const evidence: MetricValidationEvidence = {
      status: "VALIDATED",
      sampleSize: 99,
      p90Error: 0,
      failureRate: 0,
      confidenceCalibrationError: 0,
      expertAgreement: 0.9,
      independentlyReviewedAt: new Date("2026-07-01"),
    };
    expect(evaluateMetricRelease("sprint-20m", "coachingRecommendations", evidence))
      .toEqual({ released: false, reasons: ["insufficient-corpus"] });
    expect(evaluateMetricRelease("sprint-20m", "coachingRecommendations", {
      ...evidence,
      sampleSize: 100,
    })).toEqual({ released: true, reasons: [] });
  });

  it("provides printable marker assets and an explicit independently measured sprint setup", () => {
    const sprint = DRILL_PROTOCOLS["sprint-20m"];
    expect(sprint.version).toBe("1.1.0");
    expect(sprint.setup.join(" ")).toContain("marker ID 0");
    expect(sprint.setup.join(" ")).toContain("marker ID 1");
    expect(sprint.setup.join(" ")).toContain("steel tape");
    expect(existsSync("public/protocols/aruco-start-id-0.png")).toBe(true);
    expect(existsSync("public/protocols/aruco-finish-id-1.png")).toBe(true);
    for (const markerId of [10, 11, 12, 13]) {
      expect(existsSync(`public/protocols/aruco-planar-id-${markerId}.png`)).toBe(true);
    }
    for (const protocol of Object.values(DRILL_PROTOCOLS)) {
      expect(protocol.version).toBe("1.1.0");
      expect(protocol.setup.join(" ")).toContain("marker IDs 10, 11, 12, and 13");
      expect(protocol.setup.join(" ")).toContain("independently surveyed coplanar control points");
    }
  });

  it("keeps drill instruction inside the controlled protocol experience instead of sending athletes to external video/search links", () => {
    const drillLibrary = readFileSync("src/app/drills/page.tsx", "utf8");

    for (const drill of STANDARD_DRILLS) {
      expect(drill.instructionVideoUrl, `${drill.slug} must not depend on an external instruction link`).toBeNull();
    }
    expect(drillLibrary).toContain('href={`/protocols#${drill.slug}`}');
    expect(drillLibrary).toContain("View capture protocol");
  });

  it("carries a catalog drill selection into the matching sport-scoped upload flow", () => {
    const drillLibrary = readFileSync("src/app/drills/page.tsx", "utf8");
    const uploadPage = readFileSync("src/app/submissions/new/page.tsx", "utf8");

    expect(drillLibrary).toContain("?sport=${encodeURIComponent(drill.sport)}&drill=${encodeURIComponent(drill.slug)}");
    expect(uploadPage).toContain("resolveSelectedDrillSlug(drills, resolvedSearchParams.drill)");
    expect(resolveSelectedDrillSlug([
      { slug: "sprint-20m" },
      { slug: "shooting-accuracy" },
    ], " shooting-accuracy ")).toBe("shooting-accuracy");
    expect(resolveSelectedDrillSlug([{ slug: "sprint-20m" }], "baseball-pitch-velocity")).toBeUndefined();
  });

  it("provides drill-specific recording-error corrections for every in-app capture protocol", () => {
    const protocolPage = readFileSync("src/app/protocols/page.tsx", "utf8");

    expect(protocolPage).toContain("Fix recording problems before upload");
    expect(protocolPage).toContain("protocol.recordingErrors.map");
    for (const [slug, protocol] of Object.entries(DRILL_PROTOCOLS)) {
      expect(protocol.recordingErrors, `${slug} needs recording-error guidance`).toHaveLength(3);
      for (const error of protocol.recordingErrors) {
        expect(error.issue.length, `${slug} needs a specific issue`).toBeGreaterThan(20);
        expect(error.correction.length, `${slug} needs a corrective action`).toBeGreaterThan(30);
      }
    }
  });

  it("releases a metric only after corpus, error, failure, confidence, and review gates pass", () => {
    const evidence: MetricValidationEvidence = {
      status: "VALIDATED",
      sampleSize: 99,
      p90Error: 0.12,
      failureRate: 0.04,
      confidenceCalibrationError: 0.06,
      expertAgreement: 0.9,
      independentlyReviewedAt: new Date("2026-07-01"),
    };
    expect(evaluateMetricRelease("sprint-20m", "sprintTime", evidence)).toEqual({
      released: false,
      reasons: ["insufficient-corpus"],
    });
    expect(evaluateMetricRelease("sprint-20m", "sprintTime", { ...evidence, sampleSize: 100 })).toEqual({
      released: true,
      reasons: [],
    });
  });

  it("keeps rankings and customer claims disabled when any validation gate is missing", () => {
    const result = evaluateMetricRelease("sprint-20m", "sprintTime", {
      status: "VALIDATED",
      sampleSize: 12,
      p90Error: 0.4,
      failureRate: 0.22,
      confidenceCalibrationError: 0.2,
      expertAgreement: 0.6,
      independentlyReviewedAt: null,
    });
    expect(result.released).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "insufficient-corpus",
      "p90-error-above-threshold",
      "failure-rate-above-threshold",
      "confidence-not-calibrated",
      "expert-agreement-below-threshold",
      "independent-review-missing",
    ]));
  });

  it("rejects metrics that are not declared by the drill protocol", () => {
    expect(evaluateMetricRelease("sprint-20m", "accuracyScore", {
      status: "VALIDATED",
      sampleSize: 100,
      p90Error: 0,
      failureRate: 0,
      confidenceCalibrationError: 0,
      expertAgreement: 1,
      independentlyReviewedAt: new Date(),
    })).toEqual({ released: false, reasons: ["metric-not-in-protocol"] });
  });
});