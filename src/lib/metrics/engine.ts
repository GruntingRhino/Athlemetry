import type { ExtractedMetrics, ExtractionInput } from "@/lib/metrics/types";

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function frameDuration(input: ExtractionInput) {
  if (
    input.frameRate &&
    input.frameRate > 0 &&
    typeof input.startFrame === "number" &&
    typeof input.finishFrame === "number" &&
    input.finishFrame > input.startFrame
  ) {
    return (input.finishFrame - input.startFrame) / input.frameRate;
  }

  return undefined;
}

function baselineFromSize(fileSize: number) {
  const sizeInMb = fileSize / (1024 * 1024);
  return Math.max(2.8, Math.min(15, 2.8 + sizeInMb / 30));
}

function qualityMultiplier(clipQuality?: string | null) {
  switch (clipQuality) {
    case "excellent":
      return 1;
    case "good":
      return 0.92;
    case "fair":
      return 0.82;
    case "poor":
      return 0.68;
    default:
      return 1;
  }
}

function angleMultiplier(cameraAngle?: string | null) {
  switch (cameraAngle) {
    case "side":
    case "open-side":
    case "behind-catcher":
      return 1;
    case "behind-pitcher":
    case "front-on":
      return 0.85;
    case "overhead":
      return 0.8;
    default:
      return 1;
  }
}

export function extractMetrics(input: ExtractionInput): ExtractedMetrics {
  const frameBasedDuration = frameDuration(input);
  const baseDuration = frameBasedDuration ?? baselineFromSize(input.fileSize);

  const quality = qualityMultiplier(input.clipQuality);
  const angle = angleMultiplier(input.cameraAngle);

  const errorToleranceScore = frameBasedDuration
    ? round(clamp((1 - 1 / ((input.frameRate ?? 30) * 0.75)) * quality * angle, 0.45, 0.98))
    : round(clamp(0.62 * quality * angle, 0.35, 0.72));

  switch (input.drillSlug) {
    case "sprint-20m": {
      const sprintTime = round(baseDuration);
      const accelerationTiming = round(sprintTime * 0.35);
      return {
        sprintTime,
        accelerationTiming,
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        motionTrackingScore: round(clamp(82 * quality * angle, 54, 96)),
        drillCompletionRate: 1,
        consistencyScore: round(clamp(78 * quality, 55, 96)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "agility-5-10-5": {
      const codTime = round(baseDuration * 1.24);
      return {
        changeOfDirectionMeasurement: codTime,
        accelerationTiming: round(codTime * 0.33),
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        motionTrackingScore: round(clamp(79 * quality * angle, 52, 95)),
        drillCompletionRate: 1,
        consistencyScore: round(clamp(74 * quality, 52, 94)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "shooting-accuracy": {
      const shotTiming = round(baseDuration * 0.45);
      const reps = input.repetitionHint ?? 10;
      return {
        shotTiming,
        repetitionCount: reps,
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        motionTrackingScore: round(clamp(75 * quality * angle, 50, 94)),
        drillCompletionRate: Math.min(1, reps / 10),
        consistencyScore: round(clamp(Math.min(100, 65 + reps * 1.8) * quality, 45, 99)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "cone-dribble": {
      const reps = input.repetitionHint ?? 6;
      const consistency = round(clamp(Math.min(100, 60 + reps * 4) * quality, 40, 99));
      return {
        changeOfDirectionMeasurement: round(baseDuration * 1.1),
        repetitionCount: reps,
        motionTrackingScore: round(clamp(80 * quality * angle, 48, 95)),
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        drillCompletionRate: Math.min(1, reps / 8),
        consistencyScore: consistency,
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "baseball-pitch-velocity": {
      const distanceFeet = input.measurementDistanceFeet && input.measurementDistanceFeet > 0
        ? input.measurementDistanceFeet
        : 60.5;
      const pitchTravelSeconds = frameBasedDuration ?? baseDuration;
      return {
        frameBasedDuration: round(pitchTravelSeconds),
        accelerationTiming: round(pitchTravelSeconds * 0.32),
        motionTrackingScore: round(clamp(88 * quality * angle, 40, 98)),
        errorToleranceScore,
        drillCompletionRate: frameBasedDuration ? 1 : 0.55,
        consistencyScore: round(clamp((distanceFeet / pitchTravelSeconds) * 0.95, 35, 99)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "baseball-pitch-command": {
      const reps = input.repetitionHint ?? 10;
      return {
        repetitionCount: reps,
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        motionTrackingScore: round(clamp(76 * quality * angle, 38, 94)),
        errorToleranceScore,
        drillCompletionRate: Math.min(1, reps / 10),
        consistencyScore: round(clamp((68 + reps * 2.4) * quality, 35, 99)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "baseball-swing-timing": {
      const reps = input.repetitionHint ?? 8;
      return {
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        shotTiming: round(baseDuration),
        repetitionCount: reps,
        motionTrackingScore: round(clamp(72 * quality * angle, 35, 92)),
        errorToleranceScore,
        drillCompletionRate: frameBasedDuration ? 1 : 0.45,
        consistencyScore: round(clamp((62 + reps * 2.2) * quality, 30, 96)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "shuttle-endurance":
    case "basketball-form-capture":
    default: {
      const reps = input.repetitionHint ?? Math.max(8, Math.round(18 - baseDuration));
      return {
        repetitionCount: reps,
        accelerationTiming: round(baseDuration * 0.28),
        motionTrackingScore: round(clamp(77 * quality * angle, 42, 94)),
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        drillCompletionRate: Math.min(1, reps / 16),
        consistencyScore: round(clamp((58 + reps * 2.1) * quality, 35, 99)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
  }
}
