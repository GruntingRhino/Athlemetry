import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  mapVisionAnalysisToMetrics,
  parseVisionOutput,
  resolveObjectModel,
  resolveLocalVideoPath,
  verifiedCameraCalibration,
  verifiedCalibrationDistance,
  verifiedPlanarCalibration,
  type VisionAnalysisResult,
} from "@/lib/vision-analysis";

const analysis: VisionAnalysisResult = {
  evidence: {
    source_path: "/tmp/clip.mp4",
    fps: 60,
    width: 1920,
    height: 1080,
    duration_seconds: 2,
    decoded_frames: 120,
    analyzed_frames: 60,
    athlete_detected_frames: 57,
    athlete_detection_rate: 0.95,
    pose_detected_frames: 54,
    pose_detection_rate: 0.9,
    athlete_tracked_frames: 55,
    athlete_tracking_rate: 0.917,
    detector: "ultralytics:yolov8n.pt",
    pose_backend: "mediapipe-blazepose",
  },
  analysis: {
    sport: "soccer",
    drill: "sprint-20m",
    metrics: {
      speed_mps: { value: 7.2, unit: "m/s", confidence: 0.88, method: "calibrated" },
      acceleration_mps2: { value: 2.4, unit: "m/s²", confidence: 0.75, method: "trajectory" },
      technique_score: { value: 71, unit: "score_0_100", confidence: 0.8, method: "pose" },
      consistency_score: { value: 76, unit: "score_0_100", confidence: 0.82, method: "pose" },
    },
    actions: [{ name: "sprint", start_seconds: 0, end_seconds: 2, confidence: 0.86 }],
    weaknesses: ["first-step acceleration"],
    recommendations: ["Drive through the first three steps."],
    overall_score: 73.5,
    reliability: {
      status: "verified-input",
      score: 0.86,
      pose_coverage: 0.9,
      calibration_available: true,
      limitations: [],
    },
  },
};

describe("vision analysis bridge", () => {
  it("uses the dedicated baseball detector only for pitch velocity", () => {
    const environment = {
      VISION_OBJECT_MODEL: "/models/general.onnx",
      VISION_BASEBALL_OBJECT_MODEL: "/models/baseball-small-object.onnx",
    };
    expect(resolveObjectModel("baseball-pitch-velocity", environment)).toBe("/models/baseball-small-object.onnx");
    expect(resolveObjectModel("baseball-pitch-command", environment)).toBe("/models/general.onnx");
  });

  it("withholds physical calibration unless the distance was independently verified", () => {
    expect(verifiedCalibrationDistance({ measurementDistanceFeet: 65.62 })).toBeUndefined();
    expect(verifiedCalibrationDistance({ measurementDistanceFeet: 65.62, calibrationVerified: true })).toBeUndefined();
    expect(verifiedCalibrationDistance({
      calibrationEvidence: {
        source: "independent-distance-survey-v1",
        status: "VERIFIED",
        distanceMeters: 20,
        reviewedBy: ["reviewer-1", "reviewer-2"],
        evidenceUri: "https://evidence.example.test/surveys/course-1",
      },
    })).toBe(20);
  });

  it("accepts only independently reviewed planar calibration correspondences", () => {
    const valid = {
      planarCalibrationEvidence: {
        source: "independent-planar-survey-v1",
        status: "VERIFIED",
        imagePoints: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
        worldPointsMeters: [[0, 0], [20, 0], [20, 10], [0, 10]],
        subject: "ground",
        protocolReference: "agility-5-10-5",
        reviewedBy: ["reviewer-1", "reviewer-2"],
        evidenceUri: "https://evidence.example.test/surveys/court-1",
      },
    };
    expect(verifiedPlanarCalibration(valid)).toMatchObject({
      imagePoints: valid.planarCalibrationEvidence.imagePoints,
      worldPointsMeters: valid.planarCalibrationEvidence.worldPointsMeters,
    });
    expect(verifiedPlanarCalibration({
      planarCalibrationEvidence: { ...valid.planarCalibrationEvidence, status: "SELF_REPORTED" },
    })).toBeUndefined();
    expect(verifiedPlanarCalibration({
      planarCalibrationEvidence: { ...valid.planarCalibrationEvidence, imagePoints: [[-1, 0], [1, 0], [1, 1], [0, 1]] },
    })).toBeUndefined();
    expect(verifiedPlanarCalibration(valid, "shuttle-endurance")).toBeUndefined();
    expect(verifiedPlanarCalibration({
      planarCalibrationEvidence: { ...valid.planarCalibrationEvidence, subject: "ball" },
    })).toBeUndefined();
    expect(verifiedPlanarCalibration({
      planarCalibrationEvidence: {
        ...valid.planarCalibrationEvidence,
        subject: "ball",
        maximumOutOfPlaneErrorMeters: 0.05,
        minimumTrackingFps: 120,
      },
    })).toMatchObject({ subject: "ball" });

    const markerLayout = {
      planarCalibrationEvidence: {
        source: "independent-planar-marker-survey-v1",
        status: "VERIFIED",
        markerWorldPointsMetersById: {
          "10": [0, 0], "11": [20, 0], "12": [20, 10], "13": [0, 10],
        },
        subject: "ground",
        protocolReference: "agility-5-10-5",
        reviewedBy: ["reviewer-1", "reviewer-2"],
        evidenceUri: "https://evidence.example.test/surveys/marker-layout-1",
      },
    };
    expect(verifiedPlanarCalibration(markerLayout)).toMatchObject({
      markerWorldPointsMetersById: markerLayout.planarCalibrationEvidence.markerWorldPointsMetersById,
      subject: "ground",
    });
    expect(verifiedPlanarCalibration({
      planarCalibrationEvidence: {
        ...markerLayout.planarCalibrationEvidence,
        markerWorldPointsMetersById: { "50": [0, 0], "11": [20, 0], "12": [20, 10], "13": [0, 10] },
      },
    })).toBeUndefined();
  });

  it("accepts only high-quality independently reviewed camera calibration", () => {
    const valid = {
      cameraCalibrationEvidence: {
        source: "independent-camera-calibration-v1",
        status: "VERIFIED",
        cameraMatrix: [[1000, 0, 960], [0, 1000, 540], [0, 0, 1]],
        distortionCoefficients: [0.01, -0.02, 0, 0, 0],
        imageWidth: 1920,
        imageHeight: 1080,
        calibrationRmsPixels: 0.4,
        deviceId: "iphone-back-wide",
        reviewedBy: ["reviewer-1", "reviewer-2"],
        evidenceUri: "https://evidence.example.test/cameras/iphone-wide",
      },
    };
    expect(verifiedCameraCalibration(valid)).toMatchObject({ imageWidth: 1920, imageHeight: 1080 });
    expect(verifiedCameraCalibration({
      cameraCalibrationEvidence: { ...valid.cameraCalibrationEvidence, calibrationRmsPixels: 1.5 },
    })).toBeUndefined();
    expect(verifiedCameraCalibration({
      cameraCalibrationEvidence: { ...valid.cameraCalibrationEvidence, reviewedBy: ["same", "same"] },
    })).toBeUndefined();
  });

  it("invalidates legacy physical metrics created from boolean calibration flags", () => {
    const sql = readFileSync(
      "prisma/migrations/20260727203000_invalidate_unproven_calibration/migration.sql",
      "utf8",
    );
    expect(sql).toMatch(/"speed" = NULL/);
    expect(sql).toMatch(/"acceleration" = NULL/);
    expect(sql).toMatch(/metadata\s*=\s*metadata\s*-\s*'calibrationVerified'/);
  });

  it("maps confidence-gated CV output into persisted metric fields", () => {
    expect(mapVisionAnalysisToMetrics(analysis)).toMatchObject({
      motionTrackingScore: 91.7,
      consistencyScore: 76,
      reliabilityScore: 86,
      speed: 7.2,
      acceleration: 2.4,
      techniqueScore: 71,
      overallPerformanceScore: 73.5,
    });
    expect(mapVisionAnalysisToMetrics(analysis).sprintTime).toBeUndefined();
    expect(mapVisionAnalysisToMetrics(analysis).frameBasedDuration).toBeUndefined();
  });

  it("uses automatic marker crossings instead of the full clip for sprint timing", () => {
    const markerCalibrated = structuredClone(analysis);
    markerCalibrated.evidence.calibration_method = "aruco-course-markers";
    markerCalibrated.evidence.calibration_elapsed_seconds = 1.8;
    markerCalibrated.evidence.calibration_confidence = 0.75;

    expect(mapVisionAnalysisToMetrics(markerCalibrated)).toMatchObject({
      frameBasedDuration: 1.8,
      sprintTime: 1.8,
      reliabilityScore: 75,
    });
  });

  it("withholds marker timing when marker confidence is below the reliability gate", () => {
    const weakMarkers = structuredClone(analysis);
    weakMarkers.evidence.calibration_method = "aruco-course-markers";
    weakMarkers.evidence.calibration_elapsed_seconds = 1.8;
    weakMarkers.evidence.calibration_confidence = 0.2;

    expect(mapVisionAnalysisToMetrics(weakMarkers)).toEqual({
      motionTrackingScore: 91.7,
      reliabilityScore: 20,
    });
  });

  it("withholds low-confidence CV values", () => {
    const lowConfidence = structuredClone(analysis);
    lowConfidence.analysis.reliability.status = "unavailable";
    lowConfidence.analysis.reliability.score = 0.2;

    expect(mapVisionAnalysisToMetrics(lowConfidence)).toEqual({
      motionTrackingScore: 91.7,
      reliabilityScore: 20,
    });
  });

  it("withholds a metric explicitly marked unavailable", () => {
    const unavailable = structuredClone(analysis);
    unavailable.analysis.metrics.speed_mps.validation_status = "unavailable";
    expect(mapVisionAnalysisToMetrics(unavailable).speed).toBeUndefined();
  });

  it("resolves local storage keys without allowing traversal", () => {
    expect(resolveLocalVideoPath("2026-07-26/example.mp4", "/tmp/uploads")).toBe(
      "/tmp/uploads/2026-07-26_example.mp4",
    );
    expect(() => resolveLocalVideoPath("../../etc/passwd", "/tmp/uploads")).toThrow(
      "Invalid storage key",
    );
  });

  it("parses the final JSON record when model-download progress precedes it", () => {
    expect(parseVisionOutput(`Downloading model: 100%\n${JSON.stringify(analysis)}\n`)).toEqual(analysis);
  });
});