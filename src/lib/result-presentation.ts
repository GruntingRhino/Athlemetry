import type { CaptureAssessment } from "@/lib/capture-adherence";
import { describeCaptureReasons, type CaptureReasonAdvice } from "@/lib/capture-reasons";

/**
 * Wording for submission results. Presentation only: callers decide
 * `primaryReleased` with the existing release logic; nothing here releases,
 * softens, or hides a fact about why a clip was withheld.
 */
export const WITHHELD_LABEL = "Not shown yet";
export const COULDNT_MEASURE_LABEL = "Couldn't measure";

export type SubmissionStatusKey =
  | "result-ready"
  | "not-analysable"
  | "held-for-research"
  | "processing"
  | "queued"
  | "retrying"
  | "failed"
  | "unknown";

export function getSubmissionStatus(input: {
  processingStatus: string;
  captureStatus: CaptureAssessment["status"] | null;
  primaryReleased: boolean;
}): { key: SubmissionStatusKey; label: string } {
  switch (input.processingStatus) {
    case "COMPLETED":
      if (input.primaryReleased) return { key: "result-ready", label: "Result ready" };
      if (input.captureStatus === "VERIFIED") return { key: "held-for-research", label: WITHHELD_LABEL };
      return { key: "not-analysable", label: COULDNT_MEASURE_LABEL };
    case "PROCESSING":
      return { key: "processing", label: "Processing" };
    case "QUEUED":
      return { key: "queued", label: "Queued" };
    case "RETRYING":
      return { key: "retrying", label: "Retrying" };
    case "FAILED":
      return { key: "failed", label: "Failed" };
    default:
      return { key: "unknown", label: "Status unavailable" };
  }
}

export type WithheldResult = {
  kind: "not-analysable" | "held-for-research";
  heading: string;
  summary: string;
  reasons: CaptureReasonAdvice[];
  /** The first reason, shown as the lead; the rest are `otherReasons`. Null when there are no reasons. */
  primaryReason: CaptureReasonAdvice | null;
  otherReasons: CaptureReasonAdvice[];
  /** Raw codes for the collapsed "Technical details" disclosure only. */
  technicalCodes: string[];
};

export function describeWithheldResult(input: {
  processingStatus: string;
  primaryReleased: boolean;
  assessment: Pick<CaptureAssessment, "status" | "reasons" | "observedFps" | "requiredFps"> | null;
  drillSlug: string;
  drillName: string;
}): WithheldResult | null {
  if (input.processingStatus !== "COMPLETED" || input.primaryReleased) return null;

  if (input.assessment?.status === "VERIFIED") {
    return {
      kind: "held-for-research",
      heading: "We can't show a result for this drill yet",
      summary: `This clip met the capture requirements, but we can't yet confirm that ${input.drillName} measurements are accurate enough to show. Until we can, no number, ranking or coaching is shown for this clip.`,
      reasons: [],
      primaryReason: null,
      otherReasons: [],
      technicalCodes: [],
    };
  }

  const reasons = describeCaptureReasons(input.assessment, input.drillSlug);
  return {
    kind: "not-analysable",
    heading: "We couldn't measure this clip",
    summary: "Athlemetry only reports a measurement when a recording meets the drill's capture requirements. This one didn't, so no number, ranking or coaching is shown for it.",
    reasons,
    primaryReason: reasons[0] ?? null,
    otherReasons: reasons.slice(1),
    technicalCodes: input.assessment?.reasons ?? [],
  };
}

/**
 * The private video player and its "administrator-reviewed observations" copy
 * only make sense once analysis has settled and there is review content to
 * show. Access to the footage itself is decided elsewhere and is unchanged.
 */
export function shouldShowVideoReview(input: { processingStatus: string; keyMomentCount: number }): boolean {
  // Retained footage stays watchable by its owner once analysis has settled
  // (the retention choice exists for this); only hide the player while a clip
  // is still in flight. keyMomentCount is intentionally not required.
  return !["QUEUED", "PROCESSING", "RETRYING"].includes(input.processingStatus);
}

/** The retry route only accepts FAILED submissions. */
export function canRetryProcessing(processingStatus: string) {
  return processingStatus === "FAILED";
}

export function rerecordHref(drillSlug: string) {
  return `/submissions/new?drill=${encodeURIComponent(drillSlug)}`;
}

export function getInProgressMessage(processingStatus: string): string | null {
  switch (processingStatus) {
    case "QUEUED":
      return "Uploaded and waiting to be analyzed. No result is shown until it passes our checks.";
    case "PROCESSING":
      return "Being analyzed now. No result is shown until it passes our checks.";
    case "RETRYING":
      return "We retry automatically, so you don't need to upload again.";
    case "FAILED":
      return "Analysis failed before a result could be produced. Use Retry processing to try again.";
    default:
      return null;
  }
}

export function describeNoResultsState(input: { submissionCount: number; completedCount: number }): {
  heading: string;
  body: string;
  showSubmissionsLink: boolean;
} {
  const heading = "No validated results yet";
  if (input.submissionCount === 0) {
    return { heading, body: "Record your first clip to get started. A result appears here once a clip meets the drill's capture requirements and its measurement has been validated.", showSubmissionsLink: false };
  }
  if (input.completedCount > 0) {
    const noun = input.completedCount === 1 ? "clip was" : "clips were";
    return {
      heading,
      body: `${input.completedCount} ${noun} analyzed, but we couldn't measure ${input.completedCount === 1 ? "it" : "them"} or can't yet confirm the measurement is accurate enough to show, so no numbers, progress or rankings appear. Open a clip to see why and how to re-record it.`,
      showSubmissionsLink: true,
    };
  }
  return { heading, body: "Your clips are still being analyzed. Results appear here once a clip has been measured and its measurement has been validated.", showSubmissionsLink: true };
}
