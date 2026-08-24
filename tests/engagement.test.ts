import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findMany, updateMany: mocks.updateMany },
    userNotification: { createMany: mocks.createMany },
    $transaction: mocks.transaction,
  },
}));

import {
  buildOnboardingSteps,
  chooseReassessmentNudge,
  chooseRetentionNudge,
  scheduleEngagementNotifications,
} from "@/lib/engagement";

const now = new Date("2026-07-26T12:00:00.000Z");

describe("onboarding progress", () => {
  it("derives durable completion from profile, consent, billing, and submission state", () => {
    expect(buildOnboardingSteps({
      profileComplete: true,
      consentRequired: true,
      consentVerified: false,
      hasPaidAccess: true,
      submissionCount: 0,
    })).toEqual([
      expect.objectContaining({ key: "profile", complete: true }),
      expect.objectContaining({ key: "consent", complete: false }),
      expect.objectContaining({ key: "subscription", complete: true }),
      expect.objectContaining({ key: "first-drill", complete: false }),
    ]);
  });
});

describe("retention scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prompts a new athlete who has not submitted a first drill", () => {
    expect(chooseRetentionNudge({ now, createdAt: new Date("2026-07-20T12:00:00.000Z"), lastSubmissionAt: null })).toMatchObject({
      key: "first-drill",
      type: "ONBOARDING",
    });
  });

  it("creates one stable return key after fourteen inactive days", () => {
    expect(chooseRetentionNudge({ now, createdAt: new Date("2026-01-01T00:00:00.000Z"), lastSubmissionAt: new Date("2026-07-01T12:00:00.000Z") })).toMatchObject({
      key: "return:2026-07-01T12:00:00.000Z",
      type: "RETENTION",
    });
  });

  it("does not nudge an athlete with recent activity", () => {
    expect(chooseRetentionNudge({ now, createdAt: new Date("2026-01-01T00:00:00.000Z"), lastSubmissionAt: new Date("2026-07-20T12:00:00.000Z") })).toBeNull();
  });

  it("creates one stable reassessment prompt when an active plan reaches its scheduled date", () => {
    expect(chooseReassessmentNudge({
      planId: "plan-1",
      reassessmentDueAt: new Date("2026-07-26T12:00:00.000Z"),
      now,
    })).toMatchObject({
      key: "reassessment:plan-1",
      type: "REASSESSMENT",
      actionHref: "/coaching",
    });
    expect(chooseReassessmentNudge({
      planId: "plan-2",
      reassessmentDueAt: new Date("2026-07-26T12:00:00.001Z"),
      now,
    })).toBeNull();
  });

  it("persists a whole sweep page in one bulk transaction", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "athlete-1",
        createdAt: new Date("2026-07-20T12:00:00.000Z"),
        submissions: [],
        coachingPlans: [{ id: "plan-1", reassessmentDueAt: new Date("2026-07-26T12:00:00.000Z") }],
      },
      { id: "athlete-2", createdAt: new Date("2026-07-19T12:00:00.000Z"), submissions: [], coachingPlans: [] },
    ]);
    mocks.createMany.mockReturnValue("create-operation");
    mocks.updateMany.mockReturnValue("update-operation");
    mocks.transaction.mockResolvedValue([{ count: 3 }, { count: 2 }]);

    await expect(scheduleEngagementNotifications(100, now)).resolves.toEqual({ checked: 2, created: 3 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [
        expect.objectContaining({ userId: "athlete-1", key: "first-drill" }),
        expect.objectContaining({ userId: "athlete-1", key: "reassessment:plan-1", actionHref: "/coaching" }),
        expect.objectContaining({ userId: "athlete-2", key: "first-drill" }),
      ],
    }));
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["athlete-1", "athlete-2"] } },
      data: { engagementCheckedAt: now },
    });
  });
});