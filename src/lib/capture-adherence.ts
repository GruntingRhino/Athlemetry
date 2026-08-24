import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

export const CAPTURE_ASSESSMENT_SOURCE = "vision-core-protocol-assessment-v1";

type CaptureEvidence = {
  fps?: number;
  athlete_tracking_rate?: number;
  pose_detection_rate?: number;
  calibration_method?: string | null;
  calibration_confidence?: number | null;
  calibration_elapsed_seconds?: number | null;
  athlete_reidentification?: { embedding_healthy?: boolean; identity_confirmed?: boolean };
  sport_drill_recognition?: { status?: string };
  segmentation?: { complete?: boolean };
  planar_calibration?: { source?: string; confidence?: number; subject?: string } | null;
};

export type CaptureAssessment = {
  source: typeof CAPTURE_ASSESSMENT_SOURCE;
  status: "VERIFIED" | "REJECTED" | "UNVERIFIED";
  protocolVersion: string | null;
  observedFps: number | null;
  requiredFps: number | null;
  reasons: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function assessCaptureAdherence(drillSlug: string, evidence: CaptureEvidence): CaptureAssessment {
  const protocol = DRILL_PROTOCOLS[drillSlug as keyof typeof DRILL_PROTOCOLS];
  if (!protocol) {
    return {
      source: CAPTURE_ASSESSMENT_SOURCE,
      status: "UNVERIFIED",
      protocolVersion: null,
      observedFps: finite(evidence.fps) ? evidence.fps : null,
      requiredFps: null,
      reasons: ["protocol-unavailable"],
    };
  }

  const reasons: string[] = [];
  const observedFps = finite(evidence.fps) ? evidence.fps : null;
  if (observedFps === null) reasons.push("frame-rate-unavailable");
  else if (observedFps < protocol.camera.minimumFps) reasons.push("frame-rate-below-protocol-minimum");
  if (!finite(evidence.athlete_tracking_rate) || evidence.athlete_tracking_rate < 0.6) reasons.push("athlete-tracking-insufficient");
  if (protocol.camera.fullBodyRequired && (!finite(evidence.pose_detection_rate) || evidence.pose_detection_rate < 0.6)) {
    reasons.push("full-body-pose-coverage-insufficient");
  }

  const rejected = reasons.some((reason) =>
    reason === "frame-rate-below-protocol-minimum"
    || reason === "athlete-tracking-insufficient"
    || reason === "full-body-pose-coverage-insufficient");
  if (rejected) {
    return {
      source: CAPTURE_ASSESSMENT_SOURCE,
      status: "REJECTED",
      protocolVersion: protocol.version,
      observedFps,
      requiredFps: protocol.camera.minimumFps,
      reasons,
    };
  }

  const identityVerified = evidence.athlete_reidentification?.embedding_healthy === true
    && evidence.athlete_reidentification.identity_confirmed === true;
  const recognitionVerified = evidence.sport_drill_recognition?.status === "confirmed";
  const segmentationVerified = evidence.segmentation?.complete === true;
  const planarCalibrationVerified = (
    evidence.calibration_method === "verified-planar-marker-homography"
    || evidence.calibration_method === "aruco-course-markers"
  )
    && evidence.planar_calibration?.source === `verified-planar-marker-layout:${drillSlug}`
    && finite(evidence.planar_calibration.confidence)
    && evidence.planar_calibration.confidence >= 0.45
    && (evidence.planar_calibration.subject === "ground"
      || evidence.planar_calibration.subject === "ball"
      || evidence.planar_calibration.subject === "bat");
  if (identityVerified && recognitionVerified && segmentationVerified && planarCalibrationVerified && reasons.length === 0) {
    return {
      source: CAPTURE_ASSESSMENT_SOURCE,
      status: "VERIFIED",
      protocolVersion: protocol.version,
      observedFps,
      requiredFps: protocol.camera.minimumFps,
      reasons: [],
    };
  }

  if (!planarCalibrationVerified) {
    if (!reasons.includes("camera-angle-unverified")) reasons.push("camera-angle-unverified");
    if (!reasons.includes("reference-geometry-unverified")) reasons.push("reference-geometry-unverified");
  }
  if (!identityVerified && !reasons.includes("athlete-identity-unverified")) reasons.push("athlete-identity-unverified");
  if (!recognitionVerified && !reasons.includes("sport-drill-unverified")) reasons.push("sport-drill-unverified");
  if (!segmentationVerified && !reasons.includes("protocol-execution-unverified")) reasons.push("protocol-execution-unverified");
  return {
    source: CAPTURE_ASSESSMENT_SOURCE,
    status: "UNVERIFIED",
    protocolVersion: protocol.version,
    observedFps,
    requiredFps: protocol.camera.minimumFps,
    reasons,
  };
}

export function readCaptureAssessment(metadata: unknown): CaptureAssessment | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const assessment = (metadata as Record<string, unknown>).captureAssessment;
  if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) return null;
  const record = assessment as Record<string, unknown>;
  if (record.source !== CAPTURE_ASSESSMENT_SOURCE) return null;
  if (record.status !== "VERIFIED" && record.status !== "REJECTED" && record.status !== "UNVERIFIED") return null;
  return assessment as CaptureAssessment;
}

export function isCaptureVerified(metadata: unknown) {
  return readCaptureAssessment(metadata)?.status === "VERIFIED";
}
