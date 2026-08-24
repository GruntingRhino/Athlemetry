import { prisma } from "@/lib/prisma";

export type OnboardingInput = {
  profileComplete: boolean;
  consentRequired: boolean;
  consentVerified: boolean;
  hasPaidAccess: boolean;
  submissionCount: number;
};

export function buildOnboardingSteps(input: OnboardingInput) {
  return [
    { key: "profile", label: "Complete athlete profile", href: "/profile", complete: input.profileComplete },
    {
      key: "consent",
      label: input.consentRequired ? "Verify parent or guardian consent" : "Consent requirements checked",
      href: "/consent",
      complete: !input.consentRequired || input.consentVerified,
    },
    { key: "subscription", label: "Activate membership", href: "/billing", complete: input.hasPaidAccess },
    { key: "first-drill", label: "Submit your first standardized drill", href: "/submissions/new", complete: input.submissionCount > 0 },
  ];
}

type RetentionInput = {
  now: Date;
  createdAt: Date;
  lastSubmissionAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

export function chooseRetentionNudge(input: RetentionInput) {
  if (!input.lastSubmissionAt) {
    if (input.now.getTime() - input.createdAt.getTime() < 3 * DAY_MS) return null;
    return {
      key: "first-drill",
      type: "ONBOARDING",
      title: "Complete your first drill",
      body: "Choose a standardized capture protocol and establish your first validated baseline.",
      actionHref: "/submissions/new",
    };
  }

  if (input.now.getTime() - input.lastSubmissionAt.getTime() < 14 * DAY_MS) return null;
  return {
    key: `return:${input.lastSubmissionAt.toISOString()}`,
    type: "RETENTION",
    title: "Your next comparison is ready",
    body: "Repeat the same standardized drill to build a comparable longitudinal record.",
    actionHref: "/submissions/new",
  };
}

export function chooseReassessmentNudge(input: { planId: string; reassessmentDueAt: Date; now: Date }) {
  if (input.reassessmentDueAt.getTime() > input.now.getTime()) return null;
  return {
    key: `reassessment:${input.planId}`,
    type: "REASSESSMENT",
    title: "Your reassessment is due",
    body: "Repeat the same standardized drill to compare your next assessment with this plan's baseline.",
    actionHref: "/coaching",
  };
}

export async function scheduleEngagementNotifications(limit = 100, now = new Date()) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, role: "ATHLETE" },
    orderBy: { engagementCheckedAt: { sort: "asc", nulls: "first" } },
    take: Math.min(500, Math.max(1, limit)),
    select: {
      id: true,
      createdAt: true,
      submissions: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true } },
      coachingPlans: {
        where: { status: "ACTIVE", reassessmentDueAt: { lte: now } },
        orderBy: { reassessmentDueAt: "asc" },
        select: { id: true, reassessmentDueAt: true },
      },
    },
  });

  const notifications = users.flatMap((user) => {
    const nudge = chooseRetentionNudge({
      now,
      createdAt: user.createdAt,
      lastSubmissionAt: user.submissions[0]?.submittedAt ?? null,
    });
    const reassessmentNudges = user.coachingPlans.flatMap((plan) => {
      const reassessmentNudge = chooseReassessmentNudge({ planId: plan.id, reassessmentDueAt: plan.reassessmentDueAt, now });
      return reassessmentNudge ? [{ userId: user.id, ...reassessmentNudge }] : [];
    });
    return [...(nudge ? [{ userId: user.id, ...nudge }] : []), ...reassessmentNudges];
  });
  if (users.length === 0) return { checked: 0, created: 0 };

  const [inserted] = await prisma.$transaction([
    prisma.userNotification.createMany({ data: notifications, skipDuplicates: true }),
    prisma.user.updateMany({
      where: { id: { in: users.map((user) => user.id) } },
      data: { engagementCheckedAt: now },
    }),
  ]);
  return { checked: users.length, created: inserted.count };
}
