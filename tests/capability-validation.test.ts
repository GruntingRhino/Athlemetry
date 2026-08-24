import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { evaluateCapabilityRelease, type CapabilityValidationEvidence } from "@/lib/capability-validation";

const passingObjectTrackingByClass: CapabilityValidationEvidence["objectTracking"]["perClass"] = {
  ball: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
  bat: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
  hoop: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
  goal: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
  plate: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
  cone: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
  target: { observations: 500, precision: 0.95, recall: 0.95, hota: 0.8 },
};

export function passingCapabilityEvidence(): CapabilityValidationEvidence {
  return {
    schemaVersion: "athlemetry-capability-validation-v1",
    independentlyReviewed: true,
    objectTracking: { observations: 500, precision: 0.95, recall: 0.94, hota: 0.8, perClass: passingObjectTrackingByClass },
    athleteReid: { observations: 500, uniqueAthletes: 50, idf1: 0.94, identitySwitchRate: 0.005, occlusionRecoveryRate: 0.93 },
    sportDrillRecognition: { clips: 300, accuracy: 0.97, falseConfirmationRate: 0.005 },
    repetitionSegmentation: { attempts: 300, precision: 0.94, recall: 0.93 },
    invalidAttemptDetection: { attempts: 300, invalidAttempts: 100, sensitivity: 0.93, specificity: 0.94 },
    planarCalibration: { captures: 100, p90ErrorMeters: 0.03, failureRate: 0.03 },
    videoNormalization: { clips: 100, deviceModels: 5, decodeFailureRate: 0.005 },
  };
}

describe("professional CV capability release gates", () => {
  it("ships a valid machine-readable capability report template", () => {
    const template = JSON.parse(readFileSync("docs/schemas/capability-validation-v1.example.json", "utf8"));
    expect(evaluateCapabilityRelease(template)).toEqual({
      released: false,
      reasons: ["capability-evidence-not-independently-reviewed"],
    });
  });

  it("releases only when every capability clears its corpus and accuracy threshold", () => {
    expect(evaluateCapabilityRelease(passingCapabilityEvidence())).toEqual({ released: true, reasons: [] });
  });

  it("rejects aggregate object evidence when a canonical class fails independently", () => {
    const evidence = {
      ...passingCapabilityEvidence(),
      objectTracking: {
        observations: 500,
        precision: 0.99,
        recall: 0.99,
        hota: 0.9,
        perClass: {
          ball: { observations: 500, precision: 0.99, recall: 0.99, hota: 0.9 },
          bat: { observations: 500, precision: 0.80, recall: 0.99, hota: 0.9 },
          hoop: { observations: 500, precision: 0.99, recall: 0.99, hota: 0.9 },
          goal: { observations: 500, precision: 0.99, recall: 0.99, hota: 0.9 },
          plate: { observations: 500, precision: 0.99, recall: 0.99, hota: 0.9 },
          cone: { observations: 500, precision: 0.99, recall: 0.99, hota: 0.9 },
          target: { observations: 500, precision: 0.99, recall: 0.99, hota: 0.9 },
        },
      },
    };

    expect(evaluateCapabilityRelease(evidence)).toEqual({
      released: false,
      reasons: expect.arrayContaining(["object-tracking-bat-precision-below-threshold"]),
    });
  });

  it("fails closed when re-identification or invalid-attempt evidence misses a threshold", () => {
    const evidence = passingCapabilityEvidence();
    evidence.athleteReid.idf1 = 0.82;
    evidence.invalidAttemptDetection.invalidAttempts = 25;
    expect(evaluateCapabilityRelease(evidence)).toEqual({
      released: false,
      reasons: expect.arrayContaining([
        "athlete-reid-idf1-below-threshold",
        "invalid-attempt-corpus-insufficient",
      ]),
    });
  });

  it("rejects unreviewed or malformed capability evidence", () => {
    expect(evaluateCapabilityRelease({ ...passingCapabilityEvidence(), independentlyReviewed: false })).toEqual({
      released: false,
      reasons: expect.arrayContaining(["capability-evidence-not-independently-reviewed"]),
    });
    expect(evaluateCapabilityRelease(null)).toEqual({
      released: false,
      reasons: ["capability-evidence-missing"],
    });
  });
});
