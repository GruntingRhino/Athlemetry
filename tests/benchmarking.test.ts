import { describe, expect, it } from "vitest";

import {
  buildCohortKey,
  calculateCohortBenchmark,
  computePercentile,
  computeQuantile,
  computeStdDev,
  isBenchmarkEligible,
  isBenchmarkCohortSufficient,
} from "@/lib/benchmarking";

describe("benchmarking math", () => {
  it("computes lower-is-better percentile correctly", () => {
    const values = [4.8, 5.1, 5.2, 5.4, 5.9];
    const percentile = computePercentile(values, 5.1, true);

    expect(percentile).toBeCloseTo(75);
  });

  it("computes higher-is-better percentile correctly", () => {
    const values = [4.8, 5.1, 5.2, 5.4, 5.9];
    const percentile = computePercentile([...values].reverse(), 5.4, false);

    expect(percentile).toBeCloseTo(75);
  });

  it("computes quantiles and stddev", () => {
    const values = [1, 2, 3, 4, 5];

    expect(computeQuantile(values, 0.5)).toBe(3);
    expect(computeStdDev(values, 3)).toBeGreaterThan(1.3);
  });

  it("builds cohort key with age bands and dimensions", () => {
    const key = buildCohortKey({
      drillType: "sprint-20m",
      athlete: {
        age: 13,
        position: "MID",
        competitionLevel: "academy",
        gender: "female",
      },
    } as never);

    expect(key).toContain("12-13");
    expect(key).toContain("MID");
    expect(key).toContain("academy");
  });

  it("marks unknown age as unspecified", () => {
    const key = buildCohortKey({
      drillType: "sprint-20m",
      athlete: {
        age: null,
        position: "MID",
        competitionLevel: "academy",
        gender: "female",
      },
    } as never);

    expect(key).toContain("UNSPECIFIED");
  });

  it("only ranks opted-in, verified, reliable performance data", () => {
    expect(isBenchmarkEligible({
      shareInBenchmarks: true,
      performanceVerified: true,
      metricReleased: true,
      reliabilityScore: 82,
      metricValue: 5.1,
    })).toBe(true);
    expect(isBenchmarkEligible({
      shareInBenchmarks: true,
      performanceVerified: false,
      metricReleased: true,
      reliabilityScore: 95,
      metricValue: 5.1,
    })).toBe(false);
    expect(isBenchmarkEligible({
      shareInBenchmarks: true,
      performanceVerified: true,
      metricReleased: true,
      reliabilityScore: 40,
      metricValue: 5.1,
    })).toBe(false);
    expect(isBenchmarkEligible({
      shareInBenchmarks: true,
      performanceVerified: true,
      metricReleased: false,
      reliabilityScore: 95,
      metricValue: 5.1,
    })).toBe(false);
  });

  it("withholds percentiles until a comparable cohort has at least 20 verified athletes", () => {
    expect(isBenchmarkCohortSufficient(19)).toBe(false);
    expect(isBenchmarkCohortSufficient(20)).toBe(true);
  });

  it("calculates every athlete snapshot from one cohort pass", () => {
    const result = calculateCohortBenchmark(
      Array.from({ length: 20 }, (_, index) => ({
        athleteId: `athlete-${index}`,
        submissionId: `submission-${index}`,
        value: index + 1,
        isAnonymized: true,
      })),
      true,
    );

    expect(result?.snapshots).toHaveLength(20);
    expect(result?.snapshots.find((item) => item.submissionId === "submission-0")?.percentile).toBe(100);
    expect(result?.snapshots.find((item) => item.submissionId === "submission-19")?.percentile).toBe(0);
    expect(result?.aggregate.sampleSize).toBe(20);
    expect(result?.aggregate.mean).toBe(10.5);
  });
});
