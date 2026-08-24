import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  extractCoachingContent,
  getCoachingPlanReassessmentDueAt,
  isCoachingActionIndexValid,
  isCoachingMetricEligible,
  isCoachingPlanEvidenceReleased,
} from "@/lib/coaching-plans";

describe("coaching plan evidence", () => {
  it("extracts only non-empty vision recommendations with a bounded confidence", () => {
    expect(extractCoachingContent({
      visionAnalysis: {
        analysis: {
          weaknesses: ["Late hip rotation", ""],
          recommendations: ["Add two sets of separation drills", 7],
          reliability: { score: 1.3 },
        },
      },
    })).toEqual({
      weaknesses: ["Late hip rotation"],
      recommendations: ["Add two sets of separation drills"],
      confidenceScore: 100,
    });
  });

  it("refuses plans without both weaknesses and specific recommendations", () => {
    expect(extractCoachingContent({ visionAnalysis: { analysis: { weaknesses: [], recommendations: [], reliability: { score: 0.8 } } } })).toBeNull();
  });

  it("requires a finite released primary result before coaching can be generated", () => {
    expect(isCoachingMetricEligible(undefined)).toBe(false);
    expect(isCoachingMetricEligible(Number.NaN)).toBe(false);
    expect(isCoachingMetricEligible(40.3)).toBe(true);
  });

  it("accepts completion only for a rendered recommendation index", () => {
    expect(isCoachingActionIndexValid(["Complete three sets"], 0)).toBe(true);
    expect(isCoachingActionIndexValid(["Complete three sets"], 1)).toBe(false);
    expect(isCoachingActionIndexValid(["Complete three sets"], -1)).toBe(false);
    expect(isCoachingActionIndexValid([""], 0)).toBe(false);
  });

  it("schedules reassessment exactly 28 UTC calendar days after plan creation", () => {
    expect(getCoachingPlanReassessmentDueAt(new Date("2026-02-01T23:30:00.000Z")).toISOString())
      .toBe("2026-03-01T23:30:00.000Z");
  });

  it("requires a separately validated recommendation model before creating coaching plans", () => {
    expect(isCoachingPlanEvidenceReleased({
      captureVerified: true,
      primaryMetricValue: 40.3,
      primaryMetricReleased: true,
      recommendationsReleased: false,
      performanceAssessmentVerified: true,
    })).toBe(false);
    expect(isCoachingPlanEvidenceReleased({
      captureVerified: true,
      primaryMetricValue: 40.3,
      primaryMetricReleased: true,
      recommendationsReleased: true,
      performanceAssessmentVerified: true,
    })).toBe(true);
    expect(isCoachingPlanEvidenceReleased({
      captureVerified: false,
      primaryMetricValue: 40.3,
      primaryMetricReleased: true,
      recommendationsReleased: true,
      performanceAssessmentVerified: true,
    })).toBe(false);
    expect(isCoachingPlanEvidenceReleased({
      captureVerified: true,
      primaryMetricValue: 40.3,
      primaryMetricReleased: true,
      recommendationsReleased: true,
      performanceAssessmentVerified: false,
    })).toBe(false);
  });

  it("archives plans created before the recommendation release gate", () => {
    const migration = readFileSync(
      "prisma/migrations/20260727183000_archive_unvalidated_coaching_plans/migration.sql",
      "utf8",
    );
    expect(migration).toContain('UPDATE "CoachingPlan"');
    expect(migration).toContain('SET "status" = \'ARCHIVED\'');
  });

  it("backfills a persisted reassessment date for every existing coaching plan", () => {
    const migration = readFileSync(
      "prisma/migrations/20260730130000_coaching_plan_reassessment/migration.sql",
      "utf8",
    );
    expect(migration).toContain('ADD COLUMN "reassessmentDueAt" TIMESTAMP(3)');
    expect(migration).toContain('"createdAt" + INTERVAL \'28 days\'');
    expect(migration).toContain('SET NOT NULL');
    expect(migration).toContain('DROP INDEX "CoachingPlan_athleteId_status_createdAt_idx"');
  });
});