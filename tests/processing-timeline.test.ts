import { describe, expect, it } from "vitest";

import {
  buildTimeline,
  isInFlight,
  nextPollDelayMs,
  parseStatusResponse,
} from "@/lib/processing-timeline";

const states = (status: string) => buildTimeline(status)?.map((step) => `${step.key}:${step.state}`);

describe("isInFlight", () => {
  it("is true only while the worker still owes a result", () => {
    for (const status of ["QUEUED", "PROCESSING", "RETRYING"]) expect(isInFlight(status)).toBe(true);
    for (const status of ["COMPLETED", "FAILED", "nonsense", ""]) expect(isInFlight(status)).toBe(false);
  });
});

describe("buildTimeline", () => {
  it("shows a queued upload as waiting its turn, with the result still pending", () => {
    expect(states("QUEUED")).toEqual(["uploaded:done", "queued:active", "analyzing:pending", "result:pending"]);
  });

  it("shows analysis in progress", () => {
    expect(states("PROCESSING")).toEqual(["uploaded:done", "queued:done", "analyzing:active", "result:pending"]);
  });

  it("shows a retry honestly as paused, not as progress", () => {
    expect(states("RETRYING")).toEqual(["uploaded:done", "queued:done", "analyzing:paused", "result:pending"]);
    const analyzing = buildTimeline("RETRYING")?.find((step) => step.key === "analyzing");
    expect(analyzing?.note).toMatch(/retry automatically/i);
  });

  it("shows a failure at the analysis step", () => {
    expect(states("FAILED")).toEqual(["uploaded:done", "queued:done", "analyzing:failed", "result:pending"]);
  });

  it("has no timeline once analysis is complete or for an unknown status", () => {
    expect(buildTimeline("COMPLETED")).toBeNull();
    expect(buildTimeline("???")).toBeNull();
  });

  it("never promises a result or a time", () => {
    const text = ["QUEUED", "PROCESSING", "RETRYING", "FAILED"]
      .flatMap((status) => buildTimeline(status) ?? [])
      .map((step) => `${step.label} ${step.note ?? ""}`)
      .join(" ");
    expect(text).not.toMatch(/\bminutes?\b|\bseconds?\b|will be ready|score|validated/i);
    expect(text).toMatch(/what to fix/i);
  });
});

describe("nextPollDelayMs", () => {
  it("starts quick and backs off to a ceiling", () => {
    expect(nextPollDelayMs(0)).toBe(4000);
    expect(nextPollDelayMs(1)).toBeGreaterThan(nextPollDelayMs(0));
    expect(nextPollDelayMs(50)).toBe(20000);
  });

  it("tolerates junk", () => {
    expect(nextPollDelayMs(-3)).toBe(4000);
    expect(nextPollDelayMs(Number.NaN)).toBe(4000);
  });
});

describe("parseStatusResponse", () => {
  it("accepts only a known processing status", () => {
    expect(parseStatusResponse({ processingStatus: "PROCESSING" })).toBe("PROCESSING");
    expect(parseStatusResponse({ processingStatus: "COMPLETED" })).toBe("COMPLETED");
    expect(parseStatusResponse({ processingStatus: "HACKED" })).toBeNull();
    expect(parseStatusResponse({})).toBeNull();
    expect(parseStatusResponse(null)).toBeNull();
    expect(parseStatusResponse("PROCESSING")).toBeNull();
  });
});
