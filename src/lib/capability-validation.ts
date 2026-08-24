export type CapabilityValidationEvidence = {
  schemaVersion: "athlemetry-capability-validation-v1";
  independentlyReviewed: boolean;
  objectTracking: {
    observations: number;
    precision: number;
    recall: number;
    hota: number;
    perClass: Record<"ball" | "bat" | "hoop" | "goal" | "plate" | "cone" | "target", {
      observations: number;
      precision: number;
      recall: number;
      hota: number;
    }>;
  };
  athleteReid: { observations: number; uniqueAthletes: number; idf1: number; identitySwitchRate: number; occlusionRecoveryRate: number };
  sportDrillRecognition: { clips: number; accuracy: number; falseConfirmationRate: number };
  repetitionSegmentation: { attempts: number; precision: number; recall: number };
  invalidAttemptDetection: { attempts: number; invalidAttempts: number; sensitivity: number; specificity: number };
  planarCalibration: { captures: number; p90ErrorMeters: number; failureRate: number };
  videoNormalization: { clips: number; deviceModels: number; decodeFailureRate: number };
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function atLeast(value: unknown, threshold: number) {
  return finite(value) && value >= threshold;
}

function atMost(value: unknown, threshold: number) {
  return finite(value) && value >= 0 && value <= threshold;
}

export function evaluateCapabilityRelease(evidence: unknown) {
  const root = record(evidence);
  if (!root) return { released: false, reasons: ["capability-evidence-missing"] };
  const reasons: string[] = [];
  if (root.schemaVersion !== "athlemetry-capability-validation-v1") reasons.push("capability-evidence-schema-unsupported");
  if (root.independentlyReviewed !== true) reasons.push("capability-evidence-not-independently-reviewed");

  const objectTracking = record(root.objectTracking);
  const objectClasses = ["ball", "bat", "hoop", "goal", "plate", "cone", "target"] as const;
  const perClass = objectTracking && record(objectTracking.perClass);
  if (!perClass) {
    reasons.push("object-tracking-per-class-evidence-missing");
  } else {
    for (const objectClass of objectClasses) {
      const metrics = record(perClass[objectClass]);
      if (!metrics || !atLeast(metrics.observations, 500)) reasons.push(`object-tracking-${objectClass}-corpus-insufficient`);
      if (!metrics || !atLeast(metrics.precision, 0.95)) reasons.push(`object-tracking-${objectClass}-precision-below-threshold`);
      if (!metrics || !atLeast(metrics.recall, 0.95)) reasons.push(`object-tracking-${objectClass}-recall-below-threshold`);
      if (!metrics || !atLeast(metrics.hota, 0.75)) reasons.push(`object-tracking-${objectClass}-hota-below-threshold`);
    }
  }

  const athleteReid = record(root.athleteReid);
  if (!athleteReid || !atLeast(athleteReid.observations, 500) || !atLeast(athleteReid.uniqueAthletes, 50)) {
    reasons.push("athlete-reid-corpus-insufficient");
  }
  if (!athleteReid || !atLeast(athleteReid.idf1, 0.9)) reasons.push("athlete-reid-idf1-below-threshold");
  if (!athleteReid || !atMost(athleteReid.identitySwitchRate, 0.01)) reasons.push("athlete-reid-switch-rate-above-threshold");
  if (!athleteReid || !atLeast(athleteReid.occlusionRecoveryRate, 0.9)) reasons.push("athlete-reid-occlusion-recovery-below-threshold");

  const recognition = record(root.sportDrillRecognition);
  if (!recognition || !atLeast(recognition.clips, 300)) reasons.push("sport-drill-recognition-corpus-insufficient");
  if (!recognition || !atLeast(recognition.accuracy, 0.95)) reasons.push("sport-drill-recognition-accuracy-below-threshold");
  if (!recognition || !atMost(recognition.falseConfirmationRate, 0.01)) reasons.push("sport-drill-recognition-false-confirmation-above-threshold");

  const segmentation = record(root.repetitionSegmentation);
  if (!segmentation || !atLeast(segmentation.attempts, 300)) reasons.push("repetition-segmentation-corpus-insufficient");
  if (!segmentation || !atLeast(segmentation.precision, 0.9)) reasons.push("repetition-segmentation-precision-below-threshold");
  if (!segmentation || !atLeast(segmentation.recall, 0.9)) reasons.push("repetition-segmentation-recall-below-threshold");

  const invalidAttempt = record(root.invalidAttemptDetection);
  if (!invalidAttempt || !atLeast(invalidAttempt.attempts, 300) || !atLeast(invalidAttempt.invalidAttempts, 100)) {
    reasons.push("invalid-attempt-corpus-insufficient");
  }
  if (!invalidAttempt || !atLeast(invalidAttempt.sensitivity, 0.9)) reasons.push("invalid-attempt-sensitivity-below-threshold");
  if (!invalidAttempt || !atLeast(invalidAttempt.specificity, 0.9)) reasons.push("invalid-attempt-specificity-below-threshold");

  const calibration = record(root.planarCalibration);
  if (!calibration || !atLeast(calibration.captures, 100)) reasons.push("planar-calibration-corpus-insufficient");
  if (!calibration || !atMost(calibration.p90ErrorMeters, 0.05)) reasons.push("planar-calibration-p90-error-above-threshold");
  if (!calibration || !atMost(calibration.failureRate, 0.05)) reasons.push("planar-calibration-failure-rate-above-threshold");

  const normalization = record(root.videoNormalization);
  if (!normalization || !atLeast(normalization.clips, 100) || !atLeast(normalization.deviceModels, 5)) {
    reasons.push("video-normalization-corpus-insufficient");
  }
  if (!normalization || !atMost(normalization.decodeFailureRate, 0.01)) reasons.push("video-normalization-failure-rate-above-threshold");

  return { released: reasons.length === 0, reasons };
}
