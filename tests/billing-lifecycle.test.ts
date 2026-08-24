import { describe, expect, it } from "vitest";

import { calculateTrialConversionRate, deriveSubscriptionLifecycleTimestamps } from "@/lib/billing-lifecycle";

describe("subscription lifecycle timestamps", () => {
  it("records the first trial and subsequent paid conversion without overwriting either timestamp", () => {
    const trialStartedAt = new Date("2026-07-01T10:00:00.000Z");
    const convertedAt = new Date("2026-07-08T10:00:00.000Z");

    const trial = deriveSubscriptionLifecycleTimestamps(null, "trialing", trialStartedAt);
    const converted = deriveSubscriptionLifecycleTimestamps(trial, "active", convertedAt);
    const laterActive = deriveSubscriptionLifecycleTimestamps(converted, "active", new Date("2026-07-20T10:00:00.000Z"));

    expect(trial).toEqual({ trialStartedAt, firstPaidAt: null });
    expect(converted).toEqual({ trialStartedAt, firstPaidAt: convertedAt });
    expect(laterActive).toEqual({ trialStartedAt, firstPaidAt: convertedAt });
  });

  it("does not treat a direct paid subscription as a trial conversion", () => {
    const startedAt = new Date("2026-07-01T10:00:00.000Z");

    expect(deriveSubscriptionLifecycleTimestamps(null, "active", startedAt)).toEqual({
      trialStartedAt: null,
      firstPaidAt: null,
    });
  });

  it("reports conversion only from provider-recorded trials and never fabricates a rate without trial starts", () => {
    expect(calculateTrialConversionRate({ trialStartedCount: 8, convertedCount: 3 })).toBe(37.5);
    expect(calculateTrialConversionRate({ trialStartedCount: 0, convertedCount: 0 })).toBeNull();
  });
});
