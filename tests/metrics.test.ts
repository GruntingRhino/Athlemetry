import { describe, expect, it } from "vitest";

import { extractMetrics } from "@/lib/metrics/engine";

describe("extractMetrics", () => {
  it("computes 20m sprint timing from frame markers", () => {
    const metrics = extractMetrics({
      drillSlug: "sprint-20m",
      frameRate: 30,
      startFrame: 15,
      finishFrame: 165,
      repetitionHint: 0,
      fileSize: 30 * 1024 * 1024,
    });

    expect(metrics.sprintTime).toBe(5);
    expect(metrics.accelerationTiming).toBe(1.75);
    expect(metrics.frameBasedDuration).toBe(5);
    expect(metrics.errorToleranceScore).toBeGreaterThan(0.9);
  });

  it("produces fallback metrics when frame metadata is missing", () => {
    const metrics = extractMetrics({
      drillSlug: "agility-5-10-5",
      fileSize: 50 * 1024 * 1024,
    });

    expect(metrics.changeOfDirectionMeasurement).toBeGreaterThan(3);
    expect(metrics.accelerationTiming).toBeGreaterThan(1);
    expect(metrics.frameBasedDuration).toBeUndefined();
  });
});
