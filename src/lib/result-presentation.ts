import type { CaptureAssessment } from "@/lib/capture-adherence";
import { describeCaptureReasons, type CaptureReasonAdvice } from "@/lib/capture-reasons";

/**
 * Wording for submission results. Presentation only: callers decide
 * `primaryReleased` with the existing release logic; nothing here releases,
 * softens, or hides a fact about why a clip was withheld.
 */
export const WITHHELD_LABEL = "Held for research";

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
      return { key: "not-analysable", label: "Not analysable" };
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
      heading: "Results for this drill aren't released yet",
      summary: `This clip met the capture requirements, but ${input.drillName} results haven't passed Athlemetry's published validation checks yet. Until they do, no number, ranking or coaching is shown for this clip.`,
      reasons: [],
      technicalCodes: [],
    };
  }

  return {
    kind: "not-analysable",
    heading: "We couldn't measure this clip",
    summary: "Athlemetry only reports a measurement when a recording meets the drill's capture requirements. This one didn't, so no number, ranking or coaching is shown for it.",
    reasons: describeCaptureReasons(input.assessment, input.drillSlug),
    technicalCodes: input.assessment?.reasons ?? [],
  };
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
      return "This clip is waiting to be analysed.";
    case "PROCESSING":
      return "This clip is being analysed now.";
    case "RETRYING":
      return "Analysis hit a temporary problem and will retry automatically.";
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
      body: `${input.completedCount} ${noun} analysed but ${input.completedCount === 1 ? "is" : "are"} ${WITHHELD_LABEL.toLowerCase()} or couldn't be measured, so no numbers, progress or rankings are shown. Open a clip to see why and how to re-record it.`,
      showSubmissionsLink: true,
    };
  }
  return { heading, body: "Your clips are still being analysed. Results appear here once a clip has been measured and its measurement has been validated.", showSubmissionsLink: true };
}
