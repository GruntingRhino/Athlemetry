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

  it("uses the same baseball defaults when distance is omitted or explicit", () => {
    const omitted = extractMetrics({
      drillSlug: "baseball-pitch-velocity",
      frameRate: 30,
      startFrame: 0,
      finishFrame: 15,
      fileSize: 20 * 1024 * 1024,
      cameraAngle: "open-side",
      clipQuality: "good",
    });

    const explicit = extractMetrics({
      drillSlug: "baseball-pitch-velocity",
      frameRate: 30,
      startFrame: 0,
      finishFrame: 15,
      fileSize: 20 * 1024 * 1024,
      cameraAngle: "open-side",
      clipQuality: "good",
      measurementDistanceFeet: 60.5,
    });

    expect(omitted.consistencyScore).toBe(explicit.consistencyScore);
    expect(omitted.motionTrackingScore).toBe(explicit.motionTrackingScore);
  });

  it("gives basketball court-line clips a concrete timing and consistency output", () => {
    const metrics = extractMetrics({
      drillSlug: "basketball-form-capture",
      frameRate: 30,
      startFrame: 12,
      finishFrame: 72,
      fileSize: 12 * 1024 * 1024,
      cameraAngle: "diagonal",
      clipQuality: "good",
      repetitionHint: 8,
      measurementDistanceFeet: 15,
    });

    expect(metrics.shotTiming).toBeGreaterThan(0);
    expect(metrics.repetitionCount).toBe(8);
    expect(metrics.consistencyScore).toBeGreaterThan(60);
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

  it("prefers side angles over front-on clips for soccer tracking", () => {
    const side = extractMetrics({
      drillSlug: "sprint-20m",
      frameRate: 30,
      startFrame: 10,
      finishFrame: 160,
      fileSize: 18 * 1024 * 1024,
      cameraAngle: "side",
      clipQuality: "good",
      measurementDistanceFeet: 65.6,
    });

    const front = extractMetrics({
      drillSlug: "sprint-20m",
      frameRate: 30,
      startFrame: 10,
      finishFrame: 160,
      fileSize: 18 * 1024 * 1024,
      cameraAngle: "front-on",
      clipQuality: "good",
      measurementDistanceFeet: 65.6,
    });

    expect(side.motionTrackingScore).toBeGreaterThan(front.motionTrackingScore ?? 0);
    expect(side.errorToleranceScore).toBeGreaterThan(front.errorToleranceScore ?? 0);
  });
});
