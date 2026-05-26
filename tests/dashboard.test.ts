import { describe, expect, it } from "vitest";

import {
  calculateAverageUserScore,
  calculateSubmissionScore,
  normalizeScoreToHundred,
} from "@/lib/dashboard";

describe("dashboard scoring", () => {
  it("normalizes common score formats onto a 0 to 100 scale", () => {
    expect(normalizeScoreToHundred(0.82)).toBe(82);
    expect(normalizeScoreToHundred(78)).toBe(78);
    expect(normalizeScoreToHundred(-2)).toBe(30);
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

    expect(score).toBe(84.3);
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

    expect(average).toBe(79.5);
  });
});
