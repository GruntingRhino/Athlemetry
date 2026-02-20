import { describe, expect, it } from "vitest";

import {
  buildCohortKey,
  computePercentile,
  computeQuantile,
  computeStdDev,
} from "@/lib/benchmarking";

describe("benchmarking math", () => {
  it("computes lower-is-better percentile correctly", () => {
    const values = [4.8, 5.1, 5.2, 5.4, 5.9];
    const percentile = computePercentile(values, 5.1, true);

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
});
