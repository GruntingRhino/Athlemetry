import type { ExtractedMetrics, ExtractionInput } from "@/lib/metrics/types";

function round(value: number) {
  return Math.round(value * 1000) / 1000;
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

export function extractMetrics(input: ExtractionInput): ExtractedMetrics {
  const frameBasedDuration = frameDuration(input);
  const baseDuration = frameBasedDuration ?? baselineFromSize(input.fileSize);

  const errorToleranceScore = frameBasedDuration
    ? round(Math.max(0.6, 1 - 1 / ((input.frameRate ?? 30) * 0.75)))
    : 0.72;

  switch (input.drillSlug) {
    case "sprint-20m": {
      const sprintTime = round(baseDuration);
      const accelerationTiming = round(sprintTime * 0.35);
      return {
        sprintTime,
        accelerationTiming,
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        motionTrackingScore: 82,
        drillCompletionRate: 1,
        consistencyScore: 78,
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
        motionTrackingScore: 79,
        drillCompletionRate: 1,
        consistencyScore: 74,
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
        motionTrackingScore: 75,
        drillCompletionRate: Math.min(1, reps / 10),
        consistencyScore: round(Math.min(100, 65 + reps * 1.8)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "cone-dribble": {
      const reps = input.repetitionHint ?? 6;
      const consistency = round(Math.min(100, 60 + reps * 4));
      return {
        changeOfDirectionMeasurement: round(baseDuration * 1.1),
        repetitionCount: reps,
        motionTrackingScore: 80,
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        drillCompletionRate: Math.min(1, reps / 8),
        consistencyScore: consistency,
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
    case "shuttle-endurance":
    default: {
      const reps = input.repetitionHint ?? Math.max(8, Math.round(18 - baseDuration));
      return {
        repetitionCount: reps,
        accelerationTiming: round(baseDuration * 0.28),
        motionTrackingScore: 77,
        frameBasedDuration: frameBasedDuration ? round(frameBasedDuration) : undefined,
        errorToleranceScore,
        drillCompletionRate: Math.min(1, reps / 16),
        consistencyScore: round(Math.min(100, 58 + reps * 2.1)),
        reliabilityScore: round(errorToleranceScore * 100),
      };
    }
  }
}
