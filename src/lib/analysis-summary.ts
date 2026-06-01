import type { DrillSubmission, MetricResult } from "@prisma/client";

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

export function buildAnalysisSummary(
  submission: Pick<DrillSubmission, "drillType" | "metadata">,
  metricResult: MetricResult,
) {
  const metadata = toObject(submission.metadata);
  const cameraAngle = readString(metadata.cameraAngle) ?? "unknown";
  const clipQuality = readString(metadata.clipQuality) ?? "unknown";
  const measurementDistanceFeet = readNumber(metadata.measurementDistanceFeet) ?? 60.5;
  const frameDuration = metricResult.frameBasedDuration;
  const reliability = metricResult.reliabilityScore ?? 0;
  const sport = readString(metadata.sport) ?? (submission.drillType.startsWith("baseball-") ? "baseball" : "soccer");

  if (submission.drillType === "baseball-pitch-velocity") {
    const velocityMph =
      typeof frameDuration === "number" && frameDuration > 0
        ? Math.round(((measurementDistanceFeet / frameDuration) * 0.681818) * 10) / 10
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
          ? "Velocity was derived from user-supplied frame markers and distance, so accuracy depends on clean release and catch/plate frames."
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
        "Use this as a repeatability/command checkpoint, not a spin model. Strike-zone visibility and catcher framing matter more than raw clip length.",
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
          ? "This batting workflow currently gives conservative timing feedback. Exit velocity is intentionally withheld unless tracking/calibration supports it."
          : buildUnclearReason(metadata, "Video was not clear enough to measure contact timing reliably."),
      spinRateStatus: {
        state: "not_applicable",
        reason: "RPM does not apply to this batting workflow.",
      },
    };
  }

  return {
    sport,
    cameraAngle,
    clipQuality,
    primaryLabel: "Primary result",
    primaryValue:
      typeof metricResult.frameBasedDuration === "number"
        ? `${metricResult.frameBasedDuration.toFixed(3)}s`
        : typeof metricResult.consistencyScore === "number"
          ? `${metricResult.consistencyScore.toFixed(1)} / 100`
          : "Available in report",
    reliabilityLabel: "Confidence",
    reliabilityValue: `${Math.round(reliability)} / 100`,
    note: "Result is based on the uploaded drill metadata and the current deterministic analysis pipeline.",
  };
}
