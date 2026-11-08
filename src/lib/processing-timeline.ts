/**
 * Presentation logic for the live clip tracker: which steps to show for a
 * processing status, and how often to ask again. It only restates the real
 * status the worker wrote. It never estimates a time, never implies a result
 * is coming, and has nothing to do with whether a result is released.
 */
const IN_FLIGHT = ["QUEUED", "PROCESSING", "RETRYING"] as const;
const KNOWN = [...IN_FLIGHT, "COMPLETED", "FAILED"] as const;

export type KnownProcessingStatus = (typeof KNOWN)[number];

export type TimelineStepKey = "uploaded" | "queued" | "analyzing" | "result";
export type TimelineStepState = "done" | "active" | "pending" | "paused" | "failed";
export type TimelineStep = { key: TimelineStepKey; label: string; state: TimelineStepState; note?: string };

export function isInFlight(status: string): boolean {
  return (IN_FLIGHT as readonly string[]).includes(status);
}

/** Steps for a clip that has no final outcome yet (or failed); null once analysis is complete. */
export function buildTimeline(status: string): TimelineStep[] | null {
  if (!isInFlight(status) && status !== "FAILED") return null;

  const queued: TimelineStepState = status === "QUEUED" ? "active" : "done";
  let analyzing: TimelineStepState = "pending";
  let analyzingNote: string | undefined;
  if (status === "PROCESSING") analyzing = "active";
  if (status === "RETRYING") {
    analyzing = "paused";
    analyzingNote = "Hit a temporary problem. We retry automatically.";
  }
  if (status === "FAILED") {
    analyzing = "failed";
    analyzingNote = "Analysis failed before a result could be produced.";
  }

  return [
    { key: "uploaded", label: "Uploaded", state: "done" },
    { key: "queued", label: "Waiting to start", state: queued },
    { key: "analyzing", label: "Analyzing", state: analyzing, note: analyzingNote },
    { key: "result", label: "Result, or what to fix", state: "pending" },
  ];
}

const BASE_DELAY_MS = 4000;
const MAX_DELAY_MS = 20000;

/** Poll quickly at first, then back off while nothing changes. */
export function nextPollDelayMs(unchangedPolls: number): number {
  if (!Number.isFinite(unchangedPolls) || unchangedPolls <= 0) return BASE_DELAY_MS;
  return Math.min(MAX_DELAY_MS, Math.round(BASE_DELAY_MS * 1.5 ** unchangedPolls));
}

/** Accept only a status the schema defines; anything else is treated as "no answer". */
export function parseStatusResponse(body: unknown): KnownProcessingStatus | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as { processingStatus?: unknown }).processingStatus;
  return typeof value === "string" && (KNOWN as readonly string[]).includes(value) ? (value as KnownProcessingStatus) : null;
}
