import { describe, expect, it } from "vitest";

import { CAPTURE_ASSESSMENT_SOURCE } from "@/lib/capture-adherence";
import {
  filterCustomerMetricResult,
  getReleasedMetricEvidenceTimestamp,
  hasReleasedMetricValue,
  isMetricReleased,
  sanitizeCustomerMetadata,
} from "@/lib/customer-metrics";

const verifiedCapture = { captureAssessment: { source: CAPTURE_ASSESSMENT_SOURCE, status: "VERIFIED" } };
const verifiedPerformance = {
  ...verifiedCapture,
  performanceAssessment: {
    source: "athlemetry-performance-verification-v1",
    status: "VERIFIED",
    metricName: "speed",
    metricVersion: "vision-v1",
    protocolVersion: "1.1.0",
    verifiedAt: "2026-07-27T20:45:00.000Z",
  },
};
const verifiedSprint = {
  ...verifiedCapture,
  performanceAssessment: {
    source: "athlemetry-performance-verification-v1",
    status: "VERIFIED",
    metricName: "sprintTime",
    metricVersion: "v2",
    protocolVersion: "1.1.0",
    verifiedAt: "2026-07-27T20:45:00.000Z",
  },
};
const perClassObjectTracking = Object.fromEntries(
  ["ball", "bat", "hoop", "goal", "plate", "cone", "target"].map((name) => [name, {
    observations: 500, precision: 0.95, recall: 0.95, hota: 0.8,
  }]),
);

const capabilityEvidence = {
  schemaVersion: "athlemetry-capability-validation-v1",
  independentlyReviewed: true,
  objectTracking: { observations: 500, precision: 0.95, recall: 0.94, hota: 0.8, perClass: perClassObjectTracking },
  athleteReid: { observations: 500, uniqueAthletes: 50, idf1: 0.94, identitySwitchRate: 0.005, occlusionRecoveryRate: 0.93 },
  sportDrillRecognition: { clips: 300, accuracy: 0.97, falseConfirmationRate: 0.005 },
  repetitionSegmentation: { attempts: 300, precision: 0.94, recall: 0.93 },
  invalidAttemptDetection: { attempts: 300, invalidAttempts: 100, sensitivity: 0.93, specificity: 0.94 },
  planarCalibration: { captures: 100, p90ErrorMeters: 0.03, failureRate: 0.03 },
  videoNormalization: { clips: 100, deviceModels: 5, decodeFailureRate: 0.005 },
};

describe("customer metric disclosure", () => {
  it("binds global validation evidence to the analyzed model version", () => {
    const validation = {
      status: "VALIDATED",
      modelVersion: "vision-v1",
      sampleSize: 100,
      p90Error: 0.1,
      failureRate: 0.01,
      confidenceCalibrationError: 0.02,
      expertAgreement: 0.95,
      evidenceUri: "https://evidence.example.test/study.json",
      evidenceSha256: "a".repeat(64),
      reviewedBy: "Expert A, Expert B",
      independentlyReviewedAt: new Date("2026-07-27T20:45:00.000Z"),
      capabilityEvidence,
    };
    expect(isMetricReleased("sprint-20m", "sprintTime", "vision-v1", validation)).toBe(true);
    expect(isMetricReleased("sprint-20m", "sprintTime", "vision-v2", validation)).toBe(false);
    expect(isMetricReleased("sprint-20m", "sprintTime", "vision-v1", { ...validation, evidenceSha256: null })).toBe(false);
    expect(isMetricReleased("sprint-20m", "sprintTime", "vision-v1", { ...validation, capabilityEvidence: null })).toBe(false);
  });
  it("returns only independently released metric fields plus provenance", () => {
    expect(filterCustomerMetricResult({
      id: "metric-1",
      submissionId: "submission-1",
      metricVersion: "v2",
      sprintTime: 3.1,
      speed: 6.45,
      techniqueScore: 81,
      reliabilityScore: 92,
      createdAt: new Date("2026-07-01"),
    }, new Set(["sprintTime"]), verifiedSprint, "sprint-20m")).toEqual({
      id: "metric-1",
      submissionId: "submission-1",
      metricVersion: "v2",
      sprintTime: 3.1,
      reliabilityScore: 92,
      createdAt: new Date("2026-07-01"),
    });
  });

  it("withholds globally released metrics when this recording did not pass protocol checks", () => {
    expect(filterCustomerMetricResult({ sprintTime: 3.1, reliabilityScore: 92 }, new Set(["sprintTime"]), {
      captureAssessment: { source: CAPTURE_ASSESSMENT_SOURCE, status: "REJECTED" },
    }, "sprint-20m")).toBeNull();
    expect(filterCustomerMetricResult({ sprintTime: 3.1 }, new Set(["sprintTime"]), {
      captureAssessment: { source: "user", status: "VERIFIED" },
    }, "sprint-20m")).toBeNull();
  });

  it("withholds shooting-mechanics output until its per-submission capture and performance gates pass", () => {
    expect(filterCustomerMetricResult({
      metricVersion: "vision-v1",
      techniqueScore: 81,
      reliabilityScore: 92,
    }, new Set(["techniqueScore"]), verifiedCapture, "shooting-mechanics")).toBeNull();
  });

  it("withholds baseball throwing-mechanics output until its per-submission capture and performance gates pass", () => {
    expect(filterCustomerMetricResult({
      metricVersion: "vision-v1",
      techniqueScore: 81,
      reliabilityScore: 92,
    }, new Set(["techniqueScore"]), verifiedCapture, "baseball-throwing-mechanics")).toBeNull();
  });

  it("withholds movement-efficiency output until its per-submission capture and performance gates pass", () => {
    expect(filterCustomerMetricResult({
      metricVersion: "vision-v1",
      consistencyScore: 81,
      reliabilityScore: 92,
    }, new Set(["consistencyScore"]), verifiedCapture, "movement-efficiency")).toBeNull();
  });

  it("requires a finite per-submission value before treating a released metric as available", () => {
    const released = new Set(["speed"]);

    expect(hasReleasedMetricValue({}, released, "speed", verifiedPerformance, "1.1.0")).toBe(false);
    expect(hasReleasedMetricValue({ speed: Number.NaN, metricVersion: "vision-v1" }, released, "speed", verifiedPerformance, "1.1.0")).toBe(false);
    expect(hasReleasedMetricValue({ speed: 40.3, metricVersion: "vision-v1" }, released, "speed", verifiedPerformance, "1.1.0")).toBe(true);
    expect(hasReleasedMetricValue({ speed: 40.3, metricVersion: "vision-v2" }, released, "speed", verifiedPerformance, "1.1.0")).toBe(false);
    expect(hasReleasedMetricValue({ speed: 40.3, metricVersion: "vision-v1" }, released, "speed", verifiedCapture, "1.1.0")).toBe(false);
  });

  it("returns an evidence timestamp only for the exact released metric identity", () => {
    expect(getReleasedMetricEvidenceTimestamp(verifiedSprint, "sprintTime", "v2", "1.1.0"))
      .toBe("2026-07-27T20:45:00.000Z");
    expect(getReleasedMetricEvidenceTimestamp(verifiedSprint, "speed", "v2", "1.1.0")).toBeNull();
    expect(getReleasedMetricEvidenceTimestamp(verifiedSprint, "sprintTime", "vision-v2", "1.1.0")).toBeNull();
  });

  it("removes raw model output and coaching claims from customer metadata", () => {
    expect(sanitizeCustomerMetadata({
      cameraAngle: "side",
      measurementDistanceFeet: 65.6,
      verifiedOutcomes: {
        attempts: 10,
        successes: 10,
        reviewedBy: ["reviewer-1", "reviewer-2"],
      },
      performanceAssessment: {
        source: "athlemetry-performance-verification-v1",
        status: "VERIFIED",
        metricName: "sprintTime",
        metricVersion: "vision-v1",
        protocolVersion: "1.1.0",
        verifiedAt: "2026-07-27T20:45:00.000Z",
      },
      analysisSummary: { primaryValue: "3.1s" },
      visionAnalysis: { coaching: ["change mechanics"] },
      analysisEngine: "internal",
    })).toEqual({
      cameraAngle: "side",
      measurementDistanceFeet: 65.6,
      performanceAssessment: {
        source: "athlemetry-performance-verification-v1",
        status: "VERIFIED",
        metricName: "sprintTime",
        metricVersion: "vision-v1",
        protocolVersion: "1.1.0",
        verifiedAt: "2026-07-27T20:45:00.000Z",
      },
    });
  });
});