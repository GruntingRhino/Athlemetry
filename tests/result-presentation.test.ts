import { describe, expect, it } from "vitest";

import {
  canRetryProcessing,
  describeNoResultsState,
  describeWithheldResult,
  getInProgressMessage,
  getSubmissionStatus,
  rerecordHref,
  WITHHELD_LABEL,
} from "@/lib/result-presentation";

describe("getSubmissionStatus", () => {
  it("uses one vocabulary for every processing and capture state", () => {
    const cases: Array<[Parameters<typeof getSubmissionStatus>[0], string]> = [
      [{ processingStatus: "COMPLETED", captureStatus: "VERIFIED", primaryReleased: true }, "Result ready"],
      [{ processingStatus: "COMPLETED", captureStatus: "REJECTED", primaryReleased: false }, "Not analysable"],
      [{ processingStatus: "COMPLETED", captureStatus: "UNVERIFIED", primaryReleased: false }, "Not analysable"],
      [{ processingStatus: "COMPLETED", captureStatus: null, primaryReleased: false }, "Not analysable"],
      [{ processingStatus: "COMPLETED", captureStatus: "VERIFIED", primaryReleased: false }, "Held for research"],
      [{ processingStatus: "PROCESSING", captureStatus: null, primaryReleased: false }, "Processing"],
      [{ processingStatus: "QUEUED", captureStatus: null, primaryReleased: false }, "Queued"],
      [{ processingStatus: "RETRYING", captureStatus: null, primaryReleased: false }, "Retrying"],
      [{ processingStatus: "FAILED", captureStatus: null, primaryReleased: false }, "Failed"],
    ];
    for (const [input, label] of cases) expect(getSubmissionStatus(input).label).toBe(label);
  });

  it("never labels a COMPLETED-but-withheld clip as complete or ready", () => {
    const status = getSubmissionStatus({ processingStatus: "COMPLETED", captureStatus: "VERIFIED", primaryReleased: false });
    expect(status.label).toBe(WITHHELD_LABEL);
    expect(status.label).not.toMatch(/complete|ready/i);
  });

  it("fails closed on an unrecognised processing status", () => {
    expect(getSubmissionStatus({ processingStatus: "WAT", captureStatus: "VERIFIED", primaryReleased: true }).label).toBe("Status unavailable");
  });
});

describe("describeWithheldResult", () => {
  const base = { drillSlug: "sprint-20m", drillName: "20m Sprint" };

  it("is null when the result is released or processing is not complete", () => {
    expect(describeWithheldResult({ ...base, processingStatus: "COMPLETED", primaryReleased: true, assessment: null })).toBeNull();
    expect(describeWithheldResult({ ...base, processingStatus: "QUEUED", primaryReleased: false, assessment: null })).toBeNull();
    expect(describeWithheldResult({ ...base, processingStatus: "FAILED", primaryReleased: false, assessment: null })).toBeNull();
  });

  it("explains a rejected capture in plain language and keeps raw codes out of the main text", () => {
    const result = describeWithheldResult({
      ...base,
      processingStatus: "COMPLETED",
      primaryReleased: false,
      assessment: {
        status: "REJECTED",
        reasons: ["frame-rate-below-protocol-minimum"],
        observedFps: 30,
        requiredFps: 60,
      },
    });
    expect(result?.kind).toBe("not-analysable");
    expect(result?.heading).toBe("We couldn't measure this clip");
    expect(result?.reasons[0].fix).toContain("60 fps");
    expect(result?.technicalCodes).toEqual(["frame-rate-below-protocol-minimum"]);
    expect(JSON.stringify({ h: result?.heading, s: result?.summary, r: result?.reasons.map(({ problem, fix }) => ({ problem, fix })) })).not.toContain("frame-rate-below");
    expect(result?.summary).toMatch(/no number, ranking or coaching/);
  });

  it("treats an unverified capture, or a missing assessment, as not analysable", () => {
    const unverified = describeWithheldResult({
      ...base,
      processingStatus: "COMPLETED",
      primaryReleased: false,
      assessment: { status: "UNVERIFIED", reasons: ["athlete-identity-unverified"], observedFps: 60, requiredFps: 60 },
    });
    expect(unverified?.kind).toBe("not-analysable");
    const missing = describeWithheldResult({ ...base, processingStatus: "COMPLETED", primaryReleased: false, assessment: null });
    expect(missing?.kind).toBe("not-analysable");
    expect(missing?.reasons).toHaveLength(1);
  });

  it("says results are not released yet when capture was verified but the metric is not released", () => {
    const result = describeWithheldResult({
      ...base,
      processingStatus: "COMPLETED",
      primaryReleased: false,
      assessment: { status: "VERIFIED", reasons: [], observedFps: 60, requiredFps: 60 },
    });
    expect(result?.kind).toBe("held-for-research");
    expect(result?.heading).toBe("Results for this drill aren't released yet");
    expect(result?.reasons).toEqual([]);
    expect(result?.summary).toContain("20m Sprint");
    expect(result?.summary).toMatch(/validation/);
  });
});

describe("retry and links", () => {
  it("offers retry only for FAILED (the route rejects every other status)", () => {
    expect(canRetryProcessing("FAILED")).toBe(true);
    for (const status of ["COMPLETED", "QUEUED", "PROCESSING", "RETRYING"]) expect(canRetryProcessing(status)).toBe(false);
  });

  it("builds a re-record link with the drill preselected", () => {
    expect(rerecordHref("sprint-20m")).toBe("/submissions/new?drill=sprint-20m");
    expect(rerecordHref("a b")).toBe("/submissions/new?drill=a%20b");
  });

  it("gives a message for in-progress states only", () => {
    expect(getInProgressMessage("QUEUED")).toMatch(/waiting/i);
    expect(getInProgressMessage("PROCESSING")).toBeTruthy();
    expect(getInProgressMessage("RETRYING")).toMatch(/automatically/i);
    expect(getInProgressMessage("FAILED")).toMatch(/Retry processing/);
    expect(getInProgressMessage("COMPLETED")).toBeNull();
  });
});

describe("describeNoResultsState", () => {
  it("invites a first clip when nothing has been submitted", () => {
    const state = describeNoResultsState({ submissionCount: 0, completedCount: 0 });
    expect(state.heading).toBe("No validated results yet");
    expect(state.body).toMatch(/first clip/i);
    expect(state.showSubmissionsLink).toBe(false);
  });

  it("explains that completed clips were held, and points to why", () => {
    const state = describeNoResultsState({ submissionCount: 3, completedCount: 2 });
    expect(state.body).toContain("2 clips");
    expect(state.body).toContain(WITHHELD_LABEL.toLowerCase());
    expect(state.showSubmissionsLink).toBe(true);
  });

  it("says clips are still being analysed when none have completed", () => {
    const state = describeNoResultsState({ submissionCount: 1, completedCount: 0 });
    expect(state.body).toMatch(/still being analysed/);
  });
});
