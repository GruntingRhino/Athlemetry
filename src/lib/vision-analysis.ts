import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { ExtractedMetrics } from "@/lib/metrics/types";

const execFileAsync = promisify(execFile);
const MIN_RELIABILITY = 0.45;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type VisionMetric = {
  value: number | null;
  unit: string;
  confidence: number;
  method: string;
  limitations?: string[];
  measurement_type?: "direct" | "derived" | "proxy" | "verified_outcome" | "composite";
  validation_status?: "requires_validation" | "input_verified" | "unavailable";
  subject?: "athlete" | "ball" | "bat" | "attempt";
};

export type VisionAnalysisResult = {
  evidence: {
    source_path: string;
    fps: number;
    width: number;
    height: number;
    duration_seconds: number;
    decoded_frames: number;
    analyzed_frames: number;
    expected_frames?: number;
    decode_completion_rate?: number;
    codec_fourcc?: string;
    object_detector_failures?: number;
    object_detector_healthy?: boolean;
    athlete_detected_frames: number;
    athlete_detection_rate: number;
    pose_detected_frames: number;
    pose_detection_rate: number;
    athlete_tracked_frames: number;
    athlete_tracking_rate: number;
    detector: string;
    pose_backend: string;
    calibration_method?: "aruco-course-markers" | "verified-distance-pose-span" | "verified-planar-homography" | "verified-planar-marker-homography" | null;
    calibration_confidence?: number;
    calibration_start_seconds?: number | null;
    calibration_finish_seconds?: number | null;
    calibration_elapsed_seconds?: number | null;
    calibration_marker_observations?: number;
    normalization?: { [key: string]: JsonValue };
    object_evidence?: { [key: string]: JsonValue };
    athlete_reidentification?: { [key: string]: JsonValue };
    sport_drill_recognition?: { [key: string]: JsonValue };
    segmentation?: { [key: string]: JsonValue };
    planar_calibration?: { [key: string]: JsonValue } | null;
  };
  analysis: {
    sport: "soccer" | "basketball" | "baseball";
    drill: string;
    metrics: Record<string, VisionMetric>;
    actions: Array<{
      name: string;
      start_seconds: number;
      end_seconds: number;
      confidence: number;
    }>;
    weaknesses: string[];
    recommendations: string[];
    overall_score: number | null;
    reliability: {
      status: "unavailable" | "relative-only" | "verified-input";
      score: number;
      pose_coverage: number;
      calibration_available: boolean;
      limitations: string[];
    };
  };
};

export type VerifiedCameraCalibration = {
  cameraMatrix: [[number, number, number], [number, number, number], [number, number, number]];
  distortionCoefficients: number[];
  imageWidth: number;
  imageHeight: number;
};

type RunVisionAnalysisInput = {
  videoPath: string;
  sport: VisionAnalysisResult["analysis"]["sport"];
  drill: string;
  calibrationDistanceMeters?: number;
  verifiedOutcomes?: { attempts: number; successes: number };
  expectedRepetitions?: number;
  homography?: ({
    imagePoints: Array<[number, number]>;
    worldPointsMeters: Array<[number, number]>;
  } | {
    markerWorldPointsMetersById: Record<string, [number, number]>;
  }) & {
    subject: "ground" | "ball" | "bat";
    protocolReference: string;
  };
  cameraCalibration?: VerifiedCameraCalibration;
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function trustedMetric(analysis: VisionAnalysisResult, key: string) {
  const metric = analysis.analysis.metrics[key];
  if (
    analysis.analysis.reliability.status === "unavailable" ||
    analysis.analysis.reliability.score < MIN_RELIABILITY ||
    !metric ||
    metric.value === null ||
    metric.validation_status === "unavailable" ||
    metric.confidence < MIN_RELIABILITY
  ) {
    return undefined;
  }
  return metric.value;
}

export function mapVisionAnalysisToMetrics(analysis: VisionAnalysisResult): ExtractedMetrics {
  const markerConfidence =
    analysis.evidence.calibration_method === "aruco-course-markers"
    && typeof analysis.evidence.calibration_confidence === "number"
    && Number.isFinite(analysis.evidence.calibration_confidence)
      ? Math.max(0, Math.min(1, analysis.evidence.calibration_confidence))
      : undefined;
  const effectiveReliability = Math.min(analysis.analysis.reliability.score, markerConfidence ?? 1);
  const metrics: ExtractedMetrics = {
    motionTrackingScore: round(analysis.evidence.athlete_tracking_rate * 100),
    reliabilityScore: round(effectiveReliability * 100),
  };

  if (
    analysis.analysis.reliability.status === "unavailable" ||
    effectiveReliability < MIN_RELIABILITY
  ) {
    return metrics;
  }

  const markerElapsed = analysis.evidence.calibration_elapsed_seconds;
  if (
    analysis.evidence.calibration_method === "aruco-course-markers"
    && typeof markerElapsed === "number"
    && Number.isFinite(markerElapsed)
    && markerElapsed > 0
  ) {
    metrics.frameBasedDuration = round(markerElapsed, 3);
    if (analysis.analysis.drill === "sprint-20m") metrics.sprintTime = metrics.frameBasedDuration;
  }

  metrics.speed = trustedMetric(analysis, "speed_mps");
  metrics.acceleration = trustedMetric(analysis, "acceleration_mps2");
  metrics.agilityScore = trustedMetric(analysis, "agility_score");
  metrics.techniqueScore = trustedMetric(analysis, "technique_score");
  metrics.accuracyScore = trustedMetric(analysis, "accuracy_score");
  metrics.powerScore = trustedMetric(analysis, "power_proxy");
  metrics.consistencyScore = trustedMetric(analysis, "consistency_score");
  metrics.overallPerformanceScore = analysis.analysis.overall_score ?? undefined;

  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== undefined),
  ) as ExtractedMetrics;
}

export function verifiedCalibrationDistance(metadata: Record<string, unknown>) {
  const evidence = metadata.calibrationEvidence;
  if (
    !evidence
    || typeof evidence !== "object"
    || Array.isArray(evidence)
  ) return undefined;
  const record = evidence as Record<string, unknown>;
  const distanceMeters = record.distanceMeters;
  const reviewedBy = record.reviewedBy;
  if (
    record.source !== "independent-distance-survey-v1"
    || record.status !== "VERIFIED"
    || typeof distanceMeters !== "number"
    || !Number.isFinite(distanceMeters)
    || distanceMeters <= 0
    || distanceMeters > 1_000
    || !Array.isArray(reviewedBy)
    || reviewedBy.length < 2
    || reviewedBy.some((reviewer) => typeof reviewer !== "string" || reviewer.trim().length === 0)
    || new Set(reviewedBy).size !== reviewedBy.length
    || typeof record.evidenceUri !== "string"
  ) return undefined;
  try {
    if (new URL(record.evidenceUri).protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return distanceMeters;
}

export function verifiedPlanarCalibration(metadata: Record<string, unknown>, expectedProtocolReference?: string) {
  const evidence = metadata.planarCalibrationEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return undefined;
  const record = evidence as Record<string, unknown>;
  const imagePoints = record.imagePoints;
  const worldPointsMeters = record.worldPointsMeters;
  const markerWorldPointsMetersById = record.markerWorldPointsMetersById;
  const reviewedBy = record.reviewedBy;
  const subject = record.subject;
  const protocolReference = record.protocolReference;
  const manualMode = record.source === "independent-planar-survey-v1";
  const markerMode = record.source === "independent-planar-marker-survey-v1";
  if (
    (!manualMode && !markerMode)
    || record.status !== "VERIFIED"
    || !Array.isArray(reviewedBy)
    || reviewedBy.length < 2
    || reviewedBy.some((reviewer) => typeof reviewer !== "string" || !reviewer.trim())
    || new Set(reviewedBy).size !== reviewedBy.length
    || typeof record.evidenceUri !== "string"
    || (subject !== "ground" && subject !== "ball" && subject !== "bat")
    || typeof protocolReference !== "string"
    || !protocolReference.trim()
    || (expectedProtocolReference !== undefined && protocolReference !== expectedProtocolReference)
  ) return undefined;
  if (
    subject !== "ground"
    && (
      typeof record.maximumOutOfPlaneErrorMeters !== "number"
      || !Number.isFinite(record.maximumOutOfPlaneErrorMeters)
      || record.maximumOutOfPlaneErrorMeters < 0
      || record.maximumOutOfPlaneErrorMeters > 0.1
      || typeof record.minimumTrackingFps !== "number"
      || !Number.isFinite(record.minimumTrackingFps)
      || record.minimumTrackingFps < 120
    )
  ) return undefined;
  const validPoint = (point: unknown, normalized: boolean): point is [number, number] => (
    Array.isArray(point)
    && point.length === 2
    && point.every((value) => typeof value === "number" && Number.isFinite(value))
    && (!normalized || point.every((value) => value >= 0 && value <= 1))
  );
  try {
    if (new URL(record.evidenceUri).protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  if (manualMode) {
    if (
      !Array.isArray(imagePoints)
      || !Array.isArray(worldPointsMeters)
      || imagePoints.length < 4
      || imagePoints.length !== worldPointsMeters.length
      || !imagePoints.every((point) => validPoint(point, true))
      || !worldPointsMeters.every((point) => validPoint(point, false))
    ) return undefined;
    return { imagePoints, worldPointsMeters, subject, protocolReference } as {
      imagePoints: Array<[number, number]>;
      worldPointsMeters: Array<[number, number]>;
      subject: "ground" | "ball" | "bat";
      protocolReference: string;
    };
  }
  if (!markerWorldPointsMetersById || typeof markerWorldPointsMetersById !== "object" || Array.isArray(markerWorldPointsMetersById)) {
    return undefined;
  }
  const markerEntries = Object.entries(markerWorldPointsMetersById);
  if (
    markerEntries.length < 4
    || markerEntries.length > 50
    || markerEntries.some(([markerId, point]) => (
      !/^\d+$/.test(markerId)
      || Number(markerId) < 0
      || Number(markerId) > 49
      || !validPoint(point, false)
    ))
  ) return undefined;
  return {
    markerWorldPointsMetersById,
    subject,
    protocolReference,
  } as {
    markerWorldPointsMetersById: Record<string, [number, number]>;
    subject: "ground" | "ball" | "bat";
    protocolReference: string;
  };
}

export function verifiedCameraCalibration(metadata: Record<string, unknown>): VerifiedCameraCalibration | undefined {
  const evidence = metadata.cameraCalibrationEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return undefined;
  const record = evidence as Record<string, unknown>;
  const matrix = record.cameraMatrix;
  const coefficients = record.distortionCoefficients;
  const reviewedBy = record.reviewedBy;
  const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (
    record.source !== "independent-camera-calibration-v1"
    || record.status !== "VERIFIED"
    || !Array.isArray(matrix)
    || matrix.length !== 3
    || matrix.some((row) => !Array.isArray(row) || row.length !== 3 || !row.every(finiteNumber))
    || !Array.isArray(coefficients)
    || ![4, 5, 8, 12, 14].includes(coefficients.length)
    || !coefficients.every(finiteNumber)
    || !Number.isInteger(record.imageWidth)
    || !Number.isInteger(record.imageHeight)
    || (record.imageWidth as number) <= 0
    || (record.imageHeight as number) <= 0
    || !finiteNumber(record.calibrationRmsPixels)
    || record.calibrationRmsPixels < 0
    || record.calibrationRmsPixels > 1
    || typeof record.deviceId !== "string"
    || !record.deviceId.trim()
    || !Array.isArray(reviewedBy)
    || reviewedBy.length < 2
    || reviewedBy.some((reviewer) => typeof reviewer !== "string" || !reviewer.trim())
    || new Set(reviewedBy).size !== reviewedBy.length
    || typeof record.evidenceUri !== "string"
  ) return undefined;
  try {
    if (new URL(record.evidenceUri).protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return {
    cameraMatrix: matrix as VerifiedCameraCalibration["cameraMatrix"],
    distortionCoefficients: coefficients as number[],
    imageWidth: record.imageWidth as number,
    imageHeight: record.imageHeight as number,
  };
}

export function resolveLocalVideoPath(storageKey: string, uploadsDirectory = process.env.LOCAL_STORAGE_DIR?.trim() || path.join(process.cwd(), "uploads")) {
  const segments = storageKey.split("/");
  if (!storageKey || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid storage key.");
  }
  return path.join(uploadsDirectory, storageKey.replaceAll("/", "_"));
}

export function parseVisionOutput(stdout: string): VisionAnalysisResult {
  const jsonRecord = stdout
    .split(/\r?\n/)
    .reverse()
    .map((line) => line.trim())
    .find((line) => line.startsWith("{") && line.endsWith("}"));
  if (!jsonRecord) {
    throw new Error("Vision analysis did not return a JSON result.");
  }
  return JSON.parse(jsonRecord) as VisionAnalysisResult;
}

export function resolveObjectModel(
  drill: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (drill === "baseball-pitch-velocity") {
    return environment.VISION_BASEBALL_OBJECT_MODEL?.trim() || undefined;
  }
  return environment.VISION_OBJECT_MODEL?.trim() || undefined;
}

export async function runVisionAnalysis(input: RunVisionAnalysisInput): Promise<VisionAnalysisResult> {
  const python = process.env.VISION_PYTHON?.trim() || "python3";
  const args = [
    "-m",
    "vision_core.video",
    "--video",
    input.videoPath,
    "--sport",
    input.sport,
    "--drill",
    input.drill,
    "--person-model",
    process.env.VISION_PERSON_MODEL?.trim() || "yolov8n.pt",
    "--pose-model",
    process.env.VISION_POSE_MODEL?.trim() || "yolov8n-pose.pt",
  ];
  if (input.calibrationDistanceMeters && input.calibrationDistanceMeters > 0) {
    args.push("--distance-meters", String(input.calibrationDistanceMeters));
  }
  if (input.verifiedOutcomes) {
    args.push("--outcomes-json", JSON.stringify(input.verifiedOutcomes));
  }
  const objectModel = resolveObjectModel(input.drill);
  if (objectModel) args.push("--object-model", objectModel);
  if (input.drill === "baseball-pitch-velocity" && objectModel) args.push("--baseball-specialist-model");
  const reidModel = process.env.VISION_REID_MODEL?.trim();
  if (reidModel) args.push("--reid-model", reidModel);
  if (input.expectedRepetitions && input.expectedRepetitions > 0) {
    args.push("--expected-repetitions", String(input.expectedRepetitions));
  }
  if (input.homography) {
    args.push("--homography-json", JSON.stringify(input.homography));
  }
  if (input.cameraCalibration) {
    args.push("--camera-calibration-json", JSON.stringify(input.cameraCalibration));
  }

  const { stdout } = await execFileAsync(python, args, {
    cwd: process.cwd(),
    timeout: Number.parseInt(process.env.VISION_TIMEOUT_MS || "120000", 10),
    maxBuffer: 10 * 1024 * 1024,
  });
  return parseVisionOutput(stdout);
}
