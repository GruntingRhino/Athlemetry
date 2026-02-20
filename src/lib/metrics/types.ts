export type ExtractionInput = {
  drillSlug: string;
  frameRate?: number | null;
  startFrame?: number | null;
  finishFrame?: number | null;
  repetitionHint?: number | null;
  fileSize: number;
};

export type ExtractedMetrics = {
  sprintTime?: number;
  accelerationTiming?: number;
  changeOfDirectionMeasurement?: number;
  shotTiming?: number;
  repetitionCount?: number;
  motionTrackingScore?: number;
  frameBasedDuration?: number;
  errorToleranceScore?: number;
  drillCompletionRate?: number;
  consistencyScore?: number;
  reliabilityScore?: number;
};
