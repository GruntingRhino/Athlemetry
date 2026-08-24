import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { buildCohortKey } from "@/lib/benchmarking";
import { getStripeClient } from "@/lib/billing";
import { checkDatabaseRateLimit } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";
import { purgeStoredVideo } from "@/lib/storage";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const rateLimit = await checkDatabaseRateLimit({
      namespace: "privacy-delete",
      identifier: session.user.id,
      windowMs: 15 * 60_000,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many deletion attempts. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
  } catch {
    return NextResponse.json({ error: "Deletion protection is temporarily unavailable." }, { status: 503 });
  }

  const payload = await request.json().catch(() => null) as { password?: unknown } | null;
  if (!payload || typeof payload.password !== "string" || payload.password.length === 0) {
    return NextResponse.json({ error: "Password confirmation is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      deletedAt: true,
      passwordHash: true,
      age: true,
      position: true,
      competitionLevel: true,
      gender: true,
      billingAccount: { include: { subscription: true } },
      submissions: {
        select: {
          id: true,
          storageProvider: true,
          storageKey: true,
          drillType: true,
          drillDefinitionId: true,
          drillDefinition: { select: { metricPrimaryKey: true } },
        },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (user.deletedAt) {
    return NextResponse.json({ error: "Account is already deleted." }, { status: 409 });
  }
  if (!(await bcrypt.compare(payload.password, user.passwordHash))) {
    return NextResponse.json({ error: "Password confirmation failed." }, { status: 401 });
  }

  const stripeSubscriptionId = user.billingAccount?.subscription?.stripeSubscriptionId;
  if (stripeSubscriptionId && user.billingAccount?.subscription?.status !== "canceled") {
    try {
      const stripe = getStripeClient();
      const authoritativeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (authoritativeSubscription.status !== "canceled") {
        const canceledSubscription = await stripe.subscriptions.cancel(stripeSubscriptionId);
        if (canceledSubscription.status !== "canceled") {
          throw new Error("Stripe did not confirm subscription cancellation.");
        }
      }
    } catch {
      return NextResponse.json({ error: "Billing cancellation could not be confirmed. Account deletion was not performed." }, { status: 502 });
    }
  }

  try {
    for (const submission of user.submissions) {
      await purgeStoredVideo({
        storageProvider: submission.storageProvider,
        storageKey: submission.storageKey,
      });
    }
  } catch {
    return NextResponse.json({ error: "Stored video deletion could not be confirmed. Account deletion was not performed." }, { status: 502 });
  }

  const affectedCohorts = Array.from(new Map(user.submissions.map((submission) => {
    const cohortKey = buildCohortKey({ drillType: submission.drillType, athlete: user } as never);
    const target = {
      cohortKey,
      drillDefinitionId: submission.drillDefinitionId,
      metricName: submission.drillDefinition.metricPrimaryKey,
    };
    return [`${cohortKey}|${target.drillDefinitionId}|${target.metricName}`, target] as const;
  })).values());

  try {
    await prisma.$transaction([
    ...(affectedCohorts.length ? [
      prisma.benchmarkAggregate.deleteMany({ where: { OR: affectedCohorts } }),
      ...affectedCohorts.map((target) => prisma.benchmarkRebuildJob.upsert({
        where: { cohortKey_drillDefinitionId_metricName: target },
        create: target,
        update: {
          status: "PENDING",
          attempts: 0,
          cursorSubmissionId: null,
          lastError: null,
          queuedAt: new Date(),
          claimedAt: null,
          completedAt: null,
        },
      })),
    ] : []),
    prisma.userReport.updateMany({
      where: { submissionId: { in: user.submissions.map((submission) => submission.id) } },
      data: { submissionId: null },
    }),
    prisma.drillSubmission.deleteMany({ where: { athleteId: session.user.id } }),
    prisma.userNotification.deleteMany({ where: { userId: session.user.id } }),
    prisma.billingAccount.deleteMany({ where: { userId: session.user.id } }),
    prisma.account.deleteMany({ where: { userId: session.user.id } }),
    prisma.dataExportRequest.deleteMany({ where: { userId: session.user.id } }),
    prisma.userReport.deleteMany({ where: { reporterId: session.user.id } }),
    prisma.userReport.updateMany({
      where: { reviewedById: session.user.id },
      data: { reviewedById: null },
    }),
    prisma.metricValidation.updateMany({
      where: { submittedByUserId: session.user.id },
      data: { submittedByUserId: null },
    }),
    prisma.metricValidation.updateMany({
      where: { approvedByUserId: session.user.id },
      data: { approvedByUserId: null },
    }),
    prisma.manualOverride.deleteMany({ where: { adminId: session.user.id } }),
    prisma.retrainingJob.updateMany({
      where: { requestedBy: session.user.id },
      data: { requestedBy: "deleted-user", notes: null },
    }),
    prisma.consentLog.updateMany({
      where: { actorUserId: session.user.id },
      data: { actorUserId: null, notes: "Action retained after actor account deletion." },
    }),
    prisma.consentLog.deleteMany({ where: { userId: session.user.id } }),
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        deletedAt: new Date(),
        email: `${session.user.id}+deleted@athlemetry.local`,
        passwordHash: "deleted",
        name: "Deleted User",
        age: null,
        position: null,
        team: null,
        competitionLevel: null,
        gender: null,
        parentEmail: null,
        parentConsentVerified: false,
        shareInBenchmarks: false,
        engagementCheckedAt: null,
      },
    }),
    prisma.session.deleteMany({
      where: { userId: session.user.id },
    }),
    prisma.consentLog.create({
      data: {
        userId: session.user.id,
        actorUserId: null,
        consentType: "ACCOUNT_DELETION",
        granted: true,
        notes: "User-initiated deletion request.",
      },
    }),
    prisma.erasureTombstone.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: { erasedAt: new Date() },
    }),
    prisma.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Account deletion finalized",
        metadata: { action: "ACCOUNT_DELETION_FINALIZED", actorUserId: session.user.id },
      },
    }),
    ]);
  } catch {
    return NextResponse.json({
      error: "Account deletion could not be finalized. External cleanup is idempotent; retry the deletion request.",
      retryable: true,
    }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  for (const cookieName of [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
  ]) {
    response.cookies.set({
      name: cookieName,
      value: "",
      expires: new Date(0),
      path: "/",
    });
  }

  return response;
}
