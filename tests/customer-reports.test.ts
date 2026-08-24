import { describe, expect, it } from "vitest";

import { buildCustomerReports, type CustomerReportSubmission } from "@/lib/customer-reports";

const metricValidation = {
  metricName: "sprintTime",
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
  capabilityEvidence: {
    schemaVersion: "athlemetry-capability-validation-v1",
    independentlyReviewed: true,
    objectTracking: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8, perClass: Object.fromEntries(["ball", "bat", "hoop", "goal", "plate", "cone", "target"].map((name) => [name, { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 }])) },
    athleteReid: { observations: 500, uniqueAthletes: 50, idf1: 0.94, identitySwitchRate: 0.005, occlusionRecoveryRate: 0.93 },
    sportDrillRecognition: { clips: 300, accuracy: 0.97, falseConfirmationRate: 0.005 },
    repetitionSegmentation: { attempts: 300, precision: 0.94, recall: 0.93 },
    invalidAttemptDetection: { attempts: 300, invalidAttempts: 100, sensitivity: 0.93, specificity: 0.94 },
    planarCalibration: { captures: 100, p90ErrorMeters: 0.03, failureRate: 0.03 },
    videoNormalization: { clips: 100, deviceModels: 5, decodeFailureRate: 0.005 },
  },
} as unknown as CustomerReportSubmission["drillDefinition"]["metricValidations"][number];

function submission(id: string, date: string, metricVersion = "vision-v1", drillId = "sprint") {
  return {
    id,
    recordingDate: new Date(date),
    location: "Track",
    metadata: {
      captureAssessment: { source: "vision-core-protocol-assessment-v1", status: "VERIFIED" },
      performanceAssessment: {
        source: "athlemetry-performance-verification-v1",
        status: "VERIFIED",
        metricName: "sprintTime",
        metricVersion,
        protocolVersion: "1.1.0",
        verifiedAt: "2026-07-27T20:45:00.000Z",
      },
    },
    metricResult: { metricVersion, sprintTime: id === "current" ? 3.9 : 4.1 },
    benchmarkSnapshots: null,
    drillDefinition: {
      id: drillId,
      name: "20m Sprint",
      slug: "sprint-20m",
      metricPrimaryKey: "sprintTime",
      metricValidations: [{ ...metricValidation, modelVersion: metricVersion }],
    },
  } satisfies CustomerReportSubmission;
}

describe("customer reports", () => {
  it("compares only the preceding released assessment with the exact drill, metric, model, and protocol identity", () => {
    const reports = buildCustomerReports([
      submission("current", "2026-07-03"),
      submission("different-model", "2026-07-02", "vision-v2"),
      submission("different-drill", "2026-07-01", "vision-v1", "other-drill"),
      submission("previous", "2026-07-01"),
    ]);

    expect(reports.find((report) => report.submission.id === "current")?.values[0].previousComparableAssessment).toEqual({
      value: 4.1,
      recordingDate: new Date("2026-07-01"),
    });
    expect(reports.find((report) => report.submission.id === "different-model")?.values[0].previousComparableAssessment).toBeNull();
    expect(reports.find((report) => report.submission.id === "different-drill")?.values[0].previousComparableAssessment).toBeNull();
  });
});