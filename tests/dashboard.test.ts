import { describe, expect, it } from "vitest";

import {
  buildEvidenceBasedDashboardGuidance,
  calculateAverageUserScore,
  calculateMetricVariability,
  calculateReleasedSubmissionScore,
  calculateSubmissionScore,
  normalizeBenchmarkPercentile,
  normalizeScoreToHundred,
  selectComparableTrendSubmissions,
} from "@/lib/dashboard";

describe("dashboard scoring", () => {
  it("keeps validated score_0_100 values on their declared scale", () => {
    expect(normalizeScoreToHundred(0.82)).toBe(0.82);
    expect(normalizeScoreToHundred(78)).toBe(78);
    expect(normalizeScoreToHundred(-2)).toBe(0);
  });

  it("computes a composite score from available metric fields", () => {
    const score = calculateSubmissionScore({
      motionTrackingScore: 80,
      errorToleranceScore: 0.9,
      drillCompletionRate: 1,
      consistencyScore: 76,
      normalizedScore: 0.72,
      reliabilityScore: 88,
    });

    expect(score).toBe(76);
  });

  it("uses only protocol-declared score_0_100 performance fields", () => {
    expect(calculateSubmissionScore({
      agilityScore: 70,
      techniqueScore: 80,
      accuracyScore: 60,
      powerScore: 75,
      overallPerformanceScore: 72,
    })).toBe(71.3);
  });

  it("builds customer composites only from independently released score fields", () => {
    expect(calculateReleasedSubmissionScore({
      techniqueScore: 64,
      reliabilityScore: 100,
      overallPerformanceScore: 100,
    }, new Set(["techniqueScore", "reliabilityScore", "overallPerformanceScore"]))).toBe(64);
  });

  it("averages the user's session scores across all completed submissions", () => {
    const average = calculateAverageUserScore([
      {
        motionTrackingScore: 80,
        errorToleranceScore: 0.9,
        drillCompletionRate: 1,
        consistencyScore: 76,
        normalizedScore: 0.72,
        reliabilityScore: 88,
      },
      {
        motionTrackingScore: 72,
        errorToleranceScore: 0.82,
        drillCompletionRate: 0.8,
        consistencyScore: 70,
        normalizedScore: 0.6,
        reliabilityScore: 84,
      },
    ]);

    expect(average).toBe(73);
  });

  it("does not fabricate a median percentile when benchmark evidence is absent", () => {
    expect(normalizeBenchmarkPercentile(undefined)).toBeNull();
    expect(normalizeBenchmarkPercentile(Number.NaN)).toBeNull();
    expect(normalizeBenchmarkPercentile(64.2)).toBe(64.2);
  });

  it("never combines different drill metrics into one progress trend", () => {
    const selected = selectComparableTrendSubmissions([
      { id: "sprint-1", drillDefinitionId: "sprint", drillDefinition: { metricPrimaryKey: "sprintTime" } },
      { id: "shot-1", drillDefinitionId: "shot", drillDefinition: { metricPrimaryKey: "shotAccuracy" } },
      { id: "sprint-2", drillDefinitionId: "sprint", drillDefinition: { metricPrimaryKey: "sprintTime" } },
      { id: "shot-2", drillDefinitionId: "shot", drillDefinition: { metricPrimaryKey: "shotAccuracy" } },
    ]);

    expect(selected.map((item) => item.id)).toEqual(["shot-1", "shot-2"]);
  });

  it("withholds performance judgments and improvement advice without released evidence", () => {
    expect(buildEvidenceBasedDashboardGuidance({
      values: [],
      scores: [],
      percentiles: [],
      recommendationsReleased: false,
    })).toEqual({
      strengths: ["No released performance evidence is available yet."],
      suggestions: ["Complete a protocol-compliant, validated drill before performance guidance is generated."],
    });
  });

  it("withholds peer guidance when released metrics lack a comparable benchmark", () => {
    const guidance = buildEvidenceBasedDashboardGuidance({
      values: [4.1, 4.0],
      scores: [82, 84],
      percentiles: [],
      recommendationsReleased: true,
    });

    expect(guidance.strengths).toContain("More released sessions are required for a stable trend");
    expect(guidance.suggestions).toContain(
      "Peer-percentile guidance is unavailable until a comparable verified cohort is available.",
    );
  });

  it("withholds guidance until the independent coaching-recommendation gate is released", () => {
    expect(buildEvidenceBasedDashboardGuidance({
      values: [4.1, 4.0, 3.9],
      scores: [82, 84, 86],
      percentiles: [62],
      recommendationsReleased: false,
    })).toEqual({
      strengths: ["Performance interpretation is unavailable until the coaching-recommendation gate is independently validated."],
      suggestions: ["No coaching recommendation is released for this drill yet."],
    });
  });

  it("reports raw within-metric variability instead of an arbitrary consistency score", () => {
    expect(calculateMetricVariability([4, 6])).toBe(1);
    expect(calculateMetricVariability([4])).toBeNull();
  });
});
