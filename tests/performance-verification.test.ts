import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildPerformanceAssessment,
  isPerformanceAssessmentVerified,
  resolveAnalyzerModelVersion,
} from "@/lib/performance-verification";

describe("performance verification", () => {
  it("refuses missing or mismatched analyzer model provenance in production", () => {
    expect(() => resolveAnalyzerModelVersion(null, "vision-v2", true)).toThrow(/active model version/);
    expect(() => resolveAnalyzerModelVersion("vision-v2", undefined, true)).toThrow(/VISION_MODEL_VERSION/);
    expect(() => resolveAnalyzerModelVersion("vision-v2", "vision-v1", true)).toThrow(/does not match/);
    expect(resolveAnalyzerModelVersion("vision-v2", "vision-v2", true)).toBe("vision-v2");
  });
  it("does not trust a bare performanceVerified boolean", () => {
    expect(isPerformanceAssessmentVerified({ performanceVerified: true }, {
      metricName: "sprintTime",
      metricVersion: "vision-v1",
      protocolVersion: "1.1.0",
    })).toBe(false);
  });

  it("builds a matching server-owned assessment only after every release gate passes", () => {
    const assessment = buildPerformanceAssessment({
      captureVerified: true,
      metricReleased: true,
      finiteMetricValue: true,
      metricName: "sprintTime",
      metricVersion: "vision-v1",
      protocolVersion: "1.1.0",
      verifiedAt: "2026-07-27T20:45:00.000Z",
    });
    expect(assessment).toEqual({
      source: "athlemetry-performance-verification-v1",
      status: "VERIFIED",
      metricName: "sprintTime",
      metricVersion: "vision-v1",
      protocolVersion: "1.1.0",
      verifiedAt: "2026-07-27T20:45:00.000Z",
    });
    expect(isPerformanceAssessmentVerified({ performanceAssessment: assessment }, {
      metricName: "sprintTime",
      metricVersion: "vision-v1",
      protocolVersion: "1.1.0",
    })).toBe(true);
  });

  it("returns an unverified assessment when any gate is missing", () => {
    expect(buildPerformanceAssessment({
      captureVerified: true,
      metricReleased: false,
      finiteMetricValue: true,
      metricName: "speed",
      metricVersion: "vision-v1",
      protocolVersion: "1.0.0",
      verifiedAt: "2026-07-27T20:45:00.000Z",
    }).status).toBe("UNVERIFIED");
  });

  it("removes benchmark state built from spoofable legacy booleans", () => {
    const sql = readFileSync(
      "prisma/migrations/20260727204500_reset_unverified_benchmarks/migration.sql",
      "utf8",
    );
    expect(sql).toMatch(/DELETE FROM "BenchmarkSnapshot"/);
    expect(sql).toMatch(/DELETE FROM "BenchmarkAggregate"/);
    expect(sql).toMatch(/metadata\s*=\s*metadata\s*-\s*'performanceVerified'/);
  });
});
