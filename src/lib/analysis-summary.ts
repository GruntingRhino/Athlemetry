import type { DrillSubmission, MetricResult } from "@prisma/client";

import { describeReferenceDistance, getDefaultMeasurementDistanceFeet } from "@/lib/drill-capture";

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildUnclearReason(metadata: Record<string, unknown>, fallback: string) {
  const clipQuality = readString(metadata.clipQuality);
  const cameraAngle = readString(metadata.cameraAngle);

  if (clipQuality === "poor") {
    return "Video was not clear enough for a reliable estimate.";
  }

  if (!cameraAngle || cameraAngle === "unknown") {
    return "Camera angle was not specific enough for a reliable estimate.";
  }

  return fallback;
}

function buildSoccerSummary(
  drillType: string,
  metricResult: MetricResult,
  cameraAngle: string,
  clipQuality: string,
  reliability: number,
  measurementDistanceFeet: number,
  calibrationNote?: string,
) {
  if (drillType === "sprint-20m") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "20m sprint time",
      primaryValue:
        typeof metricResult.sprintTime === "number" ? `${metricResult.sprintTime.toFixed(3)}s` : "Unavailable",
      secondaryLabel: "Field reference",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        calibrationNote
        ?? "Side or diagonal clips with the full sprint lane visible give the most reliable result. If the distance is custom, the slider keeps the estimate conservative.",
    };
  }

  if (drillType === "agility-5-10-5") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "Change-of-direction time",
      primaryValue:
        typeof metricResult.changeOfDirectionMeasurement === "number"
          ? `${metricResult.changeOfDirectionMeasurement.toFixed(3)}s`
          : "Unavailable",
      secondaryLabel: "Shuttle spacing",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "A wide side or diagonal view with visible line touches is the cleanest setup. If the camera is angled off-axis, the output stays conservative.",
    };
  }

  if (drillType === "shooting-accuracy") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "Shot cycle timing",
      primaryValue:
        typeof metricResult.shotTiming === "number" ? `${metricResult.shotTiming.toFixed(3)}s` : "Unavailable",
      secondaryLabel: "Goal reference",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "Keep the goal mouth or target area visible. The output is conservative when the camera is not behind-goal or the target is obscured.",
    };
  }

  if (drillType === "shooting-mechanics") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "Shooting mechanics capture",
      primaryValue:
        typeof metricResult.techniqueScore === "number" ? `${metricResult.techniqueScore.toFixed(1)} / 100` : "Unavailable",
      secondaryLabel: "Mechanics lane",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "This protocol records visible plant and first-strike evidence only; it is not a coaching or shot-quality claim. Customer output remains withheld until the current capture and release gates pass.",
    };
  }

  if (drillType === "movement-efficiency") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "Movement-route capture",
      primaryValue:
        typeof metricResult.consistencyScore === "number" ? `${metricResult.consistencyScore.toFixed(1)} / 100` : "Unavailable",
      secondaryLabel: "Movement route",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "This protocol records visible route, turn, and finish-target evidence only; it is not an efficiency, coaching, or scientific claim. Customer output remains withheld until the current capture and release gates pass.",
    };
  }

  if (drillType === "passing-accuracy") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "Passing target accuracy",
      primaryValue:
        typeof metricResult.accuracyScore === "number" ? `${metricResult.accuracyScore.toFixed(1)} / 100` : "Unavailable",
      secondaryLabel: "Passing lane",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "Only independently verified target outcomes can support this protocol-defined result. Keep the stationary start line, full lane, and numbered target visible.",
    };
  }

  if (drillType === "first-touch-control") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "First-touch control accuracy",
      primaryValue:
        typeof metricResult.accuracyScore === "number" ? `${metricResult.accuracyScore.toFixed(1)} / 100` : "Unavailable",
      secondaryLabel: "Service lane",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "Only independently verified first-touch outcomes inside the marked control square can support this protocol-defined result. Keep the measured service line, both cones, and numbered target visible.",
    };
  }

  if (drillType === "cone-dribble") {
    return {
      sport: "soccer",
      cameraAngle,
      clipQuality,
      primaryLabel: "Route consistency",
      primaryValue:
        typeof metricResult.consistencyScore === "number"
          ? `${metricResult.consistencyScore.toFixed(1)} / 100`
          : "Unavailable",
      secondaryLabel: "Cone spacing",
      secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "A top-side, side, or diagonal route view works best. The reference slider is there so the route stays usable when the field setup changes.",
    };
  }

  return {
    sport: "soccer",
    cameraAngle,
    clipQuality,
    primaryLabel: "Workload repetition count",
    primaryValue:
      typeof metricResult.repetitionCount === "number" ? `${metricResult.repetitionCount}` : "Unavailable",
    secondaryLabel: "Route spacing",
    secondaryValue: describeReferenceDistance(drillType, measurementDistanceFeet),
    reliabilityLabel: "Confidence",
    reliabilityValue: `${Math.round(reliability)} / 100`,
    note:
      "Field-length framing with clean rep markers gives the most reliable endurance output. When the route spacing differs from the default, the slider keeps the estimate grounded.",
  };
}

export function buildAnalysisSummary(
  submission: Pick<DrillSubmission, "drillType" | "metadata">,
  metricResult: MetricResult,
) {
  const metadata = toObject(submission.metadata);
  const cameraAngle = readString(metadata.cameraAngle) ?? "unknown";
  const clipQuality = readString(metadata.clipQuality) ?? "unknown";
  const measurementDistanceFeet = readNumber(metadata.measurementDistanceFeet) ?? undefined;
  const frameDuration = metricResult.frameBasedDuration;
  const reliability = metricResult.reliabilityScore ?? 0;
  const sport = readString(metadata.sport) ?? (submission.drillType.startsWith("baseball-") ? "baseball" : "soccer");
  const visionEvidence = toObject(toObject(metadata.visionAnalysis).evidence);
  const calibrationMethod = readString(visionEvidence.calibration_method);
  const calibrationConfidence = readNumber(visionEvidence.calibration_confidence);
  const calibrationObservations = readNumber(visionEvidence.calibration_marker_observations);
  const calibrationNote =
    calibrationMethod === "aruco-course-markers"
    && calibrationConfidence !== undefined
    && calibrationObservations !== undefined
      ? `Automatic start/finish marker timing was detected across ${calibrationObservations} frames with ${Math.round(calibrationConfidence * 100)}% calibration confidence.`
      : undefined;

  if (submission.drillType === "basketball-free-throw") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Free-throw outcome status",
      primaryValue: "Unavailable pending validated outcome evidence",
      secondaryLabel: "Court reference",
      secondaryValue: describeReferenceDistance(submission.drillType, measurementDistanceFeet),
      reliabilityLabel: "Capture confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "A free-throw result requires ten independently reviewable attempts with the measured line, ball, hoop, and first outcome visible. Capture confidence is not a made-shot percentage, accuracy claim, or benchmark eligibility.",
    };
  }

  if (submission.drillType === "basketball-lane-agility") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Lane-agility timing status",
      primaryValue: "Unavailable pending validated route evidence",
      secondaryLabel: "Lane route",
      secondaryValue: describeReferenceDistance(submission.drillType, measurementDistanceFeet),
      reliabilityLabel: "Capture confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "A lane-agility result requires verified route geometry, visible line touches, and independently reviewed timing evidence. Capture confidence is not a timing measurement, agility score, or benchmark eligibility.",
    };
  }

  if (submission.drillType === "basketball-spot-shooting") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Spot-shooting outcome status",
      primaryValue: "Unavailable pending validated outcome evidence",
      secondaryLabel: "Court reference",
      secondaryValue: describeReferenceDistance(submission.drillType, measurementDistanceFeet),
      reliabilityLabel: "Capture confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note: "A spot-shooting result requires independently reviewable marked spots, ball, hoop, releases, and first outcomes for every attempt. Capture confidence is not a made-shot percentage, accuracy claim, consistency result, or benchmark eligibility.",
    };
  }

  if (submission.drillType === "basketball-form-capture") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Shot form timing",
      primaryValue: typeof frameDuration === "number" ? `${frameDuration.toFixed(3)}s` : "Unavailable",
      secondaryLabel: "Court reference",
      secondaryValue: describeReferenceDistance(submission.drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "Basketball analysis anchors off visible free-throw or three-point markings. If the clip is off-angle, the distance slider keeps the result conservative instead of pretending the camera was perfect.",
    };
  }

  if (submission.drillType === "baseball-pitch-velocity") {
    const calibratedSpeed =
      typeof metricResult.speed === "number" && Number.isFinite(metricResult.speed)
        ? metricResult.speed
        : null;
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: calibratedSpeed === null ? "Release-to-target timing" : "Calibrated pitch speed",
      primaryValue:
        calibratedSpeed === null
          ? typeof frameDuration === "number" ? `${frameDuration.toFixed(3)}s` : "Unavailable"
          : `${calibratedSpeed.toFixed(2)} m/s`,
      secondaryLabel: calibratedSpeed === null ? "Velocity status" : "Release-to-target timing",
      secondaryValue:
        calibratedSpeed === null
          ? "Unavailable"
          : typeof frameDuration === "number" ? `${frameDuration.toFixed(3)}s` : "Unavailable",
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        calibratedSpeed === null
          ? "Velocity is withheld unless a separately calibrated speed metric passes the pitch-velocity validation gate. User-entered distance and frame timing are not independent calibration."
          : "This speed came from the calibrated analyzer output. Customer display additionally requires the independent pitch-speed validation gate.",
      spinRateStatus: {
        state: "unavailable",
        reason: buildUnclearReason(metadata, "Video was not clear enough to estimate RPM reliably."),
      },
    };
  }

  if (submission.drillType === "baseball-pitch-command") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Command session consistency",
      primaryValue:
        typeof metricResult.consistencyScore === "number"
          ? `${metricResult.consistencyScore.toFixed(1)} / 100`
          : "Unavailable",
      secondaryLabel: "Pitch count logged",
      secondaryValue:
        typeof metricResult.repetitionCount === "number" ? `${metricResult.repetitionCount}` : "Unavailable",
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "Use this as a repeatability and command checkpoint, not a spin model. A behind-catcher or behind-pitcher view with the strike zone visible is the cleanest setup.",
      spinRateStatus: {
        state: "unavailable",
        reason: buildUnclearReason(metadata, "Command clips do not provide enough ball detail for RPM estimation."),
      },
    };
  }

  if (submission.drillType === "baseball-throwing-mechanics") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Throwing-mechanics capture",
      primaryValue: "Unavailable",
      secondaryLabel: "Throwing lane",
      secondaryValue: describeReferenceDistance(submission.drillType, measurementDistanceFeet),
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        "This protocol records visible ball, plate-marker, target-reference, and throwing-action evidence only. Customer output remains withheld until the current capture and release gates pass.",
      spinRateStatus: {
        state: "not_applicable",
        reason: "This controlled capture does not provide a released physical measurement.",
      },
    };
  }

  if (submission.drillType === "baseball-swing-timing") {
    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Load-to-contact timing",
      primaryValue:
        typeof frameDuration === "number" ? `${frameDuration.toFixed(3)}s` : "Unavailable",
      secondaryLabel: "Swing set count",
      secondaryValue:
        typeof metricResult.repetitionCount === "number" ? `${metricResult.repetitionCount}` : "Unavailable",
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        typeof frameDuration === "number"
          ? "This batting workflow gives conservative timing feedback. Exit velocity is intentionally withheld unless tracking and calibration support it."
          : buildUnclearReason(metadata, "Video was not clear enough to measure contact timing reliably."),
      spinRateStatus: {
        state: "not_applicable",
        reason: "RPM does not apply to this batting workflow.",
      },
    };
  }

  if (sport === "soccer") {
    return buildSoccerSummary(
      submission.drillType,
      metricResult,
      cameraAngle,
      clipQuality,
      reliability,
      measurementDistanceFeet ?? getDefaultMeasurementDistanceFeet(submission.drillType),
      calibrationNote,
    );
  }

  return {
    sport,
    cameraAngle,
    clipQuality,
    primaryLabel: "Primary result",
    primaryValue:
      typeof frameDuration === "number"
        ? `${frameDuration.toFixed(3)}s`
        : typeof metricResult.consistencyScore === "number"
          ? `${metricResult.consistencyScore.toFixed(1)} / 100`
          : "Available in report",
    reliabilityLabel: "Confidence",
    reliabilityValue: `${Math.round(reliability)} / 100`,
    note: "Result is based on the uploaded drill metadata and the current deterministic analysis pipeline.",
  };
}
