export type MetricPresentation = {
  label: string;
  unit: string;
  definition: string;
  measurementType: string;
  method: string;
  interpretation: string;
  limitations: string;
};

const METRIC_PRESENTATIONS: Record<string, MetricPresentation> = {
  sprintTime: {
    label: "Sprint time",
    unit: "seconds",
    definition: "Elapsed time from the verified start marker to the verified finish marker.",
    measurementType: "Timed measurement",
    method: "Timed from the protocol-defined start and finish markers in a verified capture.",
    interpretation: "Lower elapsed time indicates a faster completed sprint over the verified course.",
    limitations: "This result applies only to the recorded course and capture; it does not diagnose health, technique, or broader athletic ability.",
  },
  acceleration: {
    label: "Acceleration",
    unit: "m/s²",
    definition: "Rate of speed change over the verified measured interval.",
    measurementType: "Calibrated physical measurement",
    method: "Calculated from verified time and distance evidence under the released calibration protocol.",
    interpretation: "A higher value indicates greater measured speed change during that verified interval.",
    limitations: "It describes this specific interval only and is not a diagnosis or a complete measure of athletic power.",
  },
  changeOfDirectionMeasurement: {
    label: "Change-of-direction time",
    unit: "seconds",
    definition: "Elapsed time for the verified change-of-direction course.",
    measurementType: "Timed measurement",
    method: "Timed across the protocol-defined route after the required line-touch events are verified.",
    interpretation: "Lower elapsed time indicates a faster completion of this verified shuttle course.",
    limitations: "It applies only to this route and capture; it does not independently assess injury risk, technique, or game performance.",
  },
  shotTiming: {
    label: "Shot timing",
    unit: "seconds",
    definition: "Verified elapsed time for the drill's defined shot event.",
    measurementType: "Timed measurement",
    method: "Timed between the protocol-defined shot-event frames in a verified capture.",
    interpretation: "Lower elapsed time indicates a shorter measured interval for the defined shot event.",
    limitations: "It is not a measure of shot quality, tactical decision-making, or overall basketball or soccer ability.",
  },
  repetitionCount: {
    label: "Repetitions",
    unit: "count",
    definition: "Number of verified valid repetitions in the recorded drill.",
    measurementType: "Verified count",
    method: "Counts only repetitions that meet the protocol's valid-attempt conditions in the recorded session.",
    interpretation: "A higher count means more verified valid repetitions in this session.",
    limitations: "It does not measure intensity, quality, fitness, or performance outside this recorded drill.",
  },
  frameBasedDuration: {
    label: "Frame-based duration",
    unit: "seconds",
    definition: "Duration measured from the protocol-defined video frames.",
    measurementType: "Frame-timed measurement",
    method: "Converts the interval between protocol-defined video frames using the verified capture frame rate.",
    interpretation: "Lower elapsed time indicates a shorter measured interval for the defined drill event.",
    limitations: "It is sensitive to the defined event boundaries and capture quality; it is not a contact, bat-speed, or coaching diagnosis.",
  },
  speed: {
    label: "Speed",
    unit: "m/s",
    definition: "Speed measured under the drill's released calibration and tracking protocol.",
    measurementType: "Calibrated physical measurement",
    method: "Calculated from released tracking and calibration evidence for the protocol-defined movement interval.",
    interpretation: "A higher value indicates greater measured speed during that verified interval.",
    limitations: "It is unavailable without the required calibration and tracking evidence and does not establish broader athletic performance.",
  },
  accuracyScore: {
    label: "Accuracy score",
    unit: "0–100 score",
    definition: "Protocol-defined scoring of verified successful outcomes.",
    measurementType: "Protocol-defined outcome score",
    method: "Scores only the verified outcomes and rules specified by the released drill protocol.",
    interpretation: "A higher score reflects more favorable verified outcomes under this protocol's scoring rules.",
    limitations: "It is not a universal accuracy measure, scouting grade, or coaching diagnosis.",
  },
  consistencyScore: {
    label: "Consistency score",
    unit: "0–100 score",
    definition: "Protocol-defined consistency across verified drill attempts.",
    measurementType: "Protocol-defined repeatability score",
    method: "Summarizes variation across verified attempts using the released drill-specific scoring rules.",
    interpretation: "A higher score reflects greater repeatability within this recorded protocol.",
    limitations: "It is a drill-specific score, not a clinical measurement, talent ranking, or assessment of overall athletic consistency.",
  },
  agilityScore: {
    label: "Agility score",
    unit: "0–100 score",
    definition: "Protocol-defined agility proxy; it is not a clinical or diagnostic measurement.",
    measurementType: "Protocol-defined proxy score",
    method: "Applies the released drill-specific scoring rules to verified change-of-direction evidence.",
    interpretation: "A higher score reflects a more favorable result under this protocol's proxy rules.",
    limitations: "This is not a direct agility measurement, clinical assessment, injury screen, or coaching diagnosis.",
  },
  techniqueScore: {
    label: "Technique score",
    unit: "0–100 score",
    definition: "Protocol-defined technique proxy; it is not a coaching diagnosis.",
    measurementType: "Protocol-defined proxy score",
    method: "Applies the released drill-specific scoring rules to verified capture features.",
    interpretation: "A higher score reflects a more favorable result under this protocol's proxy rules.",
    limitations: "This is not an expert technique evaluation, medical assessment, or individualized coaching diagnosis.",
  },
  powerScore: {
    label: "Power score",
    unit: "0–100 score",
    definition: "Protocol-defined power proxy; it is not a direct physical power measurement.",
    measurementType: "Protocol-defined proxy score",
    method: "Applies the released drill-specific scoring rules to verified capture features.",
    interpretation: "A higher score reflects a more favorable result under this protocol's proxy rules.",
    limitations: "This is not a direct physical power measurement, clinical assessment, or individualized coaching diagnosis.",
  },
};

export function getMetricPresentation(metricName: string) {
  return METRIC_PRESENTATIONS[metricName] ?? null;
}

export function formatCustomerMetricValue(value: number, unit: string) {
  if (unit === "count") return String(Math.round(value));
  return `${value.toFixed(2)} ${unit}`;
}

export function formatCustomerMetricDelta(value: number, unit: string) {
  if (value === 0) return "No numerical change";
  return `${formatCustomerMetricValue(Math.abs(value), unit)} ${value > 0 ? "higher" : "lower"}`;
}
