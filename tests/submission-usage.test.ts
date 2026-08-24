import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MONTHLY_SUBMISSION_LIMIT,
  consumeMonthlySubmissionQuota,
  getMonthlySubmissionLimit,
  getMonthlySubmissionQuotaSummary,
  getSubmissionUsageMonthStart,
  SubmissionQuotaExceededError,
} from "@/lib/submission-usage";

describe("monthly submission usage", () => {
  afterEach(() => {
    delete process.env.ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT;
  });

  it("uses the configured bounded allowance and defaults conservatively", () => {
    expect(getMonthlySubmissionLimit({})).toBe(DEFAULT_MONTHLY_SUBMISSION_LIMIT);
    expect(getMonthlySubmissionLimit({ ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT: "35" })).toBe(35);
    expect(() => getMonthlySubmissionLimit({ ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT: "0" })).toThrow(/between/i);
    expect(() => getMonthlySubmissionLimit({ ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT: "20.5" })).toThrow(/whole number/i);
  });

  it("normalizes all usage into a UTC calendar month", () => {
    expect(getSubmissionUsageMonthStart(new Date("2026-08-01T00:30:00+02:00")).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("returns a customer-safe monthly quota summary without exposing administrator limits", () => {
    expect(getMonthlySubmissionQuotaSummary(undefined, "ATHLETE", { ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT: "35" }))
      .toEqual({ used: 0, limit: 35, remaining: 35 });
    expect(getMonthlySubmissionQuotaSummary(35, "ATHLETE", { ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT: "35" }))
      .toEqual({ used: 35, limit: 35, remaining: 0 });
    expect(getMonthlySubmissionQuotaSummary(2, "ADMIN", { ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT: "35" })).toBeNull();
  });

  it("fails closed when an atomic quota claim does not return an available usage row", async () => {
    const transaction = {
      $queryRaw: async <T>() => [] as T,
    };

    await expect(consumeMonthlySubmissionQuota(transaction, { userId: "athlete-1", role: "ATHLETE" }))
      .rejects.toBeInstanceOf(SubmissionQuotaExceededError);
  });

  it("does not consume a quota row for administrators", async () => {
    const queryRaw = async <T>() => [{ submissionCount: 1 }] as T;

    await expect(consumeMonthlySubmissionQuota({ $queryRaw: queryRaw }, { userId: "admin-1", role: "ADMIN" }))
      .resolves.toEqual({ used: 0, limit: null });
  });
});
