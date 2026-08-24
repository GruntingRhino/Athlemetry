import { describe, expect, it } from "vitest";

import { processingRetryDecision } from "@/lib/processing/retry-policy";

const now = new Date("2026-07-26T12:00:00.000Z");

describe("processing retry policy", () => {
  it("schedules persistent exponential backoff", () => {
    expect(processingRetryDecision(1, now)).toEqual({ terminal: false, nextAttemptAt: new Date("2026-07-26T12:00:30.000Z") });
    expect(processingRetryDecision(2, now)).toEqual({ terminal: false, nextAttemptAt: new Date("2026-07-26T12:01:00.000Z") });
  });

  it("dead-letters the third failed attempt", () => {
    expect(processingRetryDecision(3, now)).toEqual({ terminal: true, nextAttemptAt: null, deadLetteredAt: now });
  });
});