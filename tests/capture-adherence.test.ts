import { describe, expect, it } from "vitest";

import { assessCaptureAdherence, isCaptureVerified } from "@/lib/capture-adherence";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    fps: 30,
    athlete_tracking_rate: 0.9,
    pose_detection_rate: 0.9,
    calibration_method: null,
    calibration_confidence: undefined,
    calibration_elapsed_seconds: undefined,
    ...overrides,
  };
}

describe("per-submission protocol adherence", () => {
  it("rejects recordings below the protocol frame-rate floor", () => {
    expect(assessCaptureAdherence("baseball-swing-timing", evidence())).toEqual(expect.objectContaining({
      status: "REJECTED",
      reasons: expect.arrayContaining(["frame-rate-below-protocol-minimum"]),
      observedFps: 30,
      requiredFps: 120,
    }));
  });

  it("does not call a high-coverage capture verified when camera and reference checks are unavailable", () => {
    expect(assessCaptureAdherence("baseball-swing-timing", evidence({ fps: 120 }))).toEqual(expect.objectContaining({
      status: "UNVERIFIED",
      reasons: expect.arrayContaining(["camera-angle-unverified", "reference-geometry-unverified"]),
    }));
  });

  it("does not treat sprint timing markers alone as full protocol 1.1 capture verification", () => {
    const assessment = assessCaptureAdherence("sprint-20m", evidence({
      fps: 60,
      calibration_method: "aruco-course-markers",
      calibration_confidence: 0.8,
      calibration_elapsed_seconds: 3.2,
    }));
    expect(assessment.status).toBe("UNVERIFIED");
    expect(assessment.reasons).toContain("reference-geometry-unverified");
  });

  it("verifies multi-sport captures only with learned identity, recognition, segmentation, and protocol-bound planar markers", () => {
    const assessment = assessCaptureAdherence("baseball-swing-timing", evidence({
      fps: 120,
      calibration_method: "verified-planar-marker-homography",
      calibration_confidence: 0.8,
      athlete_reidentification: { embedding_healthy: true, identity_confirmed: true },
      sport_drill_recognition: { status: "confirmed" },
      segmentation: { complete: true },
      planar_calibration: {
        source: "verified-planar-marker-layout:baseball-swing-timing",
        confidence: 0.8,
        subject: "ground",
      },
    }));
    expect(assessment.status).toBe("VERIFIED");
    expect(isCaptureVerified({ captureAssessment: assessment })).toBe(true);
  });

  it("fails closed for missing or user-authored assessment state", () => {
    expect(isCaptureVerified({})).toBe(false);
    expect(isCaptureVerified({ captureAssessment: { status: "VERIFIED", source: "user" } })).toBe(false);
  });
});
