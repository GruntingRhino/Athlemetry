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
        "Side or diagonal clips with the full sprint lane visible give the most reliable result. If the distance is custom, the slider keeps the estimate conservative.",
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
    const distanceFeet = measurementDistanceFeet ?? 60.5;
    const velocityMph =
      typeof frameDuration === "number" && frameDuration > 0
        ? Math.round(((distanceFeet / frameDuration) * 0.681818) * 10) / 10
        : null;

    return {
      sport,
      cameraAngle,
      clipQuality,
      primaryLabel: "Pitch velocity estimate",
      primaryValue: velocityMph !== null ? `${velocityMph.toFixed(1)} mph` : "Unavailable",
      secondaryLabel: "Release-to-target travel",
      secondaryValue: typeof frameDuration === "number" ? `${frameDuration.toFixed(3)}s` : "Unavailable",
      reliabilityLabel: "Confidence",
      reliabilityValue: `${Math.round(reliability)} / 100`,
      note:
        velocityMph !== null
          ? `Velocity was derived from user-supplied frame markers and a ${describeReferenceDistance(submission.drillType, distanceFeet)} anchor, so accuracy depends on clean release and catch/plate frames.`
          : buildUnclearReason(metadata, "Video was not clear enough to estimate pitch velocity reliably."),
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
