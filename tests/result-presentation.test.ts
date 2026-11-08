import { describe, expect, it } from "vitest";

import {
  canRetryProcessing,
  COULDNT_MEASURE_LABEL,
  describeNoResultsState,
  describeWithheldResult,
  getInProgressMessage,
  getSubmissionStatus,
  rerecordHref,
  shouldShowVideoReview,
  WITHHELD_LABEL,
} from "@/lib/result-presentation";

describe("getSubmissionStatus", () => {
  it("uses one vocabulary for every processing and capture state", () => {
    const cases: Array<[Parameters<typeof getSubmissionStatus>[0], string]> = [
      [{ processingStatus: "COMPLETED", captureStatus: "VERIFIED", primaryReleased: true }, "Result ready"],
      [{ processingStatus: "COMPLETED", captureStatus: "REJECTED", primaryReleased: false }, "Couldn't measure"],
      [{ processingStatus: "COMPLETED", captureStatus: "UNVERIFIED", primaryReleased: false }, "Couldn't measure"],
      [{ processingStatus: "COMPLETED", captureStatus: null, primaryReleased: false }, "Couldn't measure"],
      [{ processingStatus: "COMPLETED", captureStatus: "VERIFIED", primaryReleased: false }, "Not shown yet"],
      [{ processingStatus: "PROCESSING", captureStatus: null, primaryReleased: false }, "Processing"],
      [{ processingStatus: "QUEUED", captureStatus: null, primaryReleased: false }, "Queued"],
      [{ processingStatus: "RETRYING", captureStatus: null, primaryReleased: false }, "Retrying"],
      [{ processingStatus: "FAILED", captureStatus: null, primaryReleased: false }, "Failed"],
    ];
    for (const [input, label] of cases) expect(getSubmissionStatus(input).label).toBe(label);
  });

  it("uses the shared plain-language labels", () => {
    expect(COULDNT_MEASURE_LABEL).toBe("Couldn't measure");
    expect(WITHHELD_LABEL).toBe("Not shown yet");
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
    expect(result?.heading).toBe("We can't show a result for this drill yet");
    expect(result?.reasons).toEqual([]);
    expect(result?.primaryReason).toBeNull();
    expect(result?.summary).toContain("20m Sprint");
    expect(result?.summary).toMatch(/can't yet confirm .* accurate enough to show/);
    expect(result?.summary).not.toMatch(/validation|gate|research/i);
  });

  it("leads with the first reason and lists the rest separately", () => {
    const result = describeWithheldResult({
      ...base,
      processingStatus: "COMPLETED",
      primaryReleased: false,
      assessment: {
        status: "REJECTED",
        reasons: ["frame-rate-below-protocol-minimum", "camera-angle-unverified", "athlete-identity-unverified"],
        observedFps: 30,
        requiredFps: 60,
      },
    });
    expect(result?.primaryReason).toBe(result?.reasons[0]);
    expect(result?.primaryReason?.code).toBe("frame-rate-below-protocol-minimum");
    expect(result?.otherReasons.map((reason) => reason.code)).toEqual(["camera-angle-unverified", "athlete-identity-unverified"]);
    expect(result?.technicalCodes).toHaveLength(3);
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
    expect(getInProgressMessage("QUEUED")).toMatch(/waiting to be analyzed/i);
    expect(getInProgressMessage("PROCESSING")).toBeTruthy();
    expect(getInProgressMessage("RETRYING")).toMatch(/automatically/i);
    expect(getInProgressMessage("FAILED")).toMatch(/Retry processing/);
    expect(getInProgressMessage("COMPLETED")).toBeNull();
  });
});

describe("shouldShowVideoReview", () => {
  it("never shows the reviewed-observations player while analysis is in flight", () => {
    for (const processingStatus of ["QUEUED", "PROCESSING", "RETRYING"]) {
      expect(shouldShowVideoReview({ processingStatus, keyMomentCount: 3 })).toBe(false);
    }
  });

  it("keeps retained footage watchable once analysis has settled, with or without reviewed moments", () => {
    expect(shouldShowVideoReview({ processingStatus: "COMPLETED", keyMomentCount: 0 })).toBe(true);
    expect(shouldShowVideoReview({ processingStatus: "COMPLETED", keyMomentCount: 2 })).toBe(true);
    expect(shouldShowVideoReview({ processingStatus: "FAILED", keyMomentCount: 0 })).toBe(true);
  });
});

describe("athlete-facing wording", () => {
  it("uses US spelling and no gate jargon", () => {
    const text = [
      ...["QUEUED", "PROCESSING", "RETRYING", "FAILED"].map(getInProgressMessage),
      ...[
        describeNoResultsState({ submissionCount: 0, completedCount: 0 }),
        describeNoResultsState({ submissionCount: 3, completedCount: 2 }),
        describeNoResultsState({ submissionCount: 1, completedCount: 0 }),
      ].map((state) => state.body),
    ].join(" ");
    expect(text).not.toMatch(/analys(e|ed|able)|held for research|release gate|validation gate/i);
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
    expect(state.body).toContain("accurate enough to show");
    expect(state.showSubmissionsLink).toBe(true);
  });

  it("says clips are still being analysed when none have completed", () => {
    const state = describeNoResultsState({ submissionCount: 1, completedCount: 0 });
    expect(state.body).toMatch(/still being analyzed/);
  });
});
