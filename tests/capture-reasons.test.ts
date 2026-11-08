import { describe, expect, it } from "vitest";

import { assessCaptureAdherence } from "@/lib/capture-adherence";
import {
  describeCaptureReasons,
  GENERIC_CAPTURE_PROBLEM,
} from "@/lib/capture-reasons";

const KNOWN_CODES = [
  "protocol-unavailable",
  "frame-rate-unavailable",
  "frame-rate-below-protocol-minimum",
  "athlete-tracking-insufficient",
  "full-body-pose-coverage-insufficient",
  "camera-angle-unverified",
  "reference-geometry-unverified",
  "athlete-identity-unverified",
  "sport-drill-unverified",
  "protocol-execution-unverified",
];

describe("describeCaptureReasons", () => {
  it("translates every code capture-adherence can emit, with a problem and a fix, never the raw code", () => {
    for (const code of KNOWN_CODES) {
      const [advice] = describeCaptureReasons({ reasons: [code], observedFps: 30, requiredFps: 60 }, "sprint-20m");
      expect(advice.code).toBe(code);
      expect(advice.problem).not.toBe(GENERIC_CAPTURE_PROBLEM);
      expect(advice.problem).not.toContain(code);
      expect(advice.fix.length).toBeGreaterThan(10);
      expect(advice.fix).not.toContain(code);
    }
  });

  it("covers every code produced by assessCaptureAdherence on real inputs", () => {
    const emitted = new Set<string>();
    for (const evidence of [{}, { fps: 24, athlete_tracking_rate: 0.1, pose_detection_rate: 0.1 }, { fps: 60, athlete_tracking_rate: 0.9, pose_detection_rate: 0.9 }]) {
      assessCaptureAdherence("sprint-20m", evidence).reasons.forEach((reason) => emitted.add(reason));
    }
    assessCaptureAdherence("no-such-drill", {}).reasons.forEach((reason) => emitted.add(reason));
    expect(emitted.size).toBeGreaterThan(5);
    for (const code of emitted) expect(KNOWN_CODES).toContain(code);
  });

  it("grounds the frame-rate advice in the observed and required fps from the assessment", () => {
    const [advice] = describeCaptureReasons(
      { reasons: ["frame-rate-below-protocol-minimum"], observedFps: 29.97, requiredFps: 60 },
      "sprint-20m",
    );
    expect(advice.problem).toContain("30 fps");
    expect(advice.problem).toContain("60 fps");
    expect(advice.fix).toContain("60 fps");
  });

  it("does not invent an fps number when none is known", () => {
    const [advice] = describeCaptureReasons({ reasons: ["frame-rate-unavailable"], observedFps: null, requiredFps: null }, "no-such-drill");
    expect(advice.fix).not.toMatch(/\d/);
  });

  it("reads accepted camera angles and reference points from the drill protocol", () => {
    const advice = describeCaptureReasons(
      { reasons: ["camera-angle-unverified", "reference-geometry-unverified"], observedFps: 60, requiredFps: 60 },
      "sprint-20m",
    );
    expect(advice[0].fix).toContain("side or diagonal");
    expect(advice[1].fix).toContain("Both measured lane endpoints");
  });

  it("maps unknown codes to one generic message and never leaks the code", () => {
    const advice = describeCaptureReasons(
      { reasons: ["some-future-code", "another-future-code"], observedFps: null, requiredFps: null },
      "sprint-20m",
    );
    expect(advice).toHaveLength(1);
    expect(advice[0].problem).toBe(GENERIC_CAPTURE_PROBLEM);
    expect(advice[0].code).toBeNull();
    expect(JSON.stringify(advice)).not.toContain("future");
  });

  it("returns the generic message when there is no assessment or no reasons", () => {
    expect(describeCaptureReasons(null, "sprint-20m")[0].problem).toBe(GENERIC_CAPTURE_PROBLEM);
    expect(describeCaptureReasons({ reasons: [], observedFps: null, requiredFps: null }, "sprint-20m")[0].problem).toBe(GENERIC_CAPTURE_PROBLEM);
  });

  it("de-duplicates repeated codes", () => {
    const advice = describeCaptureReasons(
      { reasons: ["athlete-tracking-insufficient", "athlete-tracking-insufficient"], observedFps: 60, requiredFps: 60 },
      "sprint-20m",
    );
    expect(advice).toHaveLength(1);
  });
});
