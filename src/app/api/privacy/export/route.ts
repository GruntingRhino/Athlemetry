import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkDatabaseRateLimit } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const rateLimit = await checkDatabaseRateLimit({
      namespace: "privacy-export",
      identifier: session.user.id,
      windowMs: 60 * 60_000,
      maxRequests: 3,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many export requests. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
  } catch {
    return NextResponse.json({ error: "Export protection is temporarily unavailable." }, { status: 503 });
  }

  const payload = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      age: true,
      position: true,
      team: true,
      competitionLevel: true,
      gender: true,
      parentEmail: true,
      parentConsentVerified: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      accounts: {
        select: {
          type: true,
          provider: true,
          providerAccountId: true,
          expires_at: true,
          token_type: true,
          scope: true,
        },
      },
      submissions: {
        select: {
          id: true,
          submittedAt: true,
          recordingDate: true,
          location: true,
          drillType: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          processingStatus: true,

          frameRate: true,
          startFrame: true,
          finishFrame: true,
          repetitionHint: true,
          metadata: true,
          metricResult: true,
          benchmarkSnapshots: true,
        },
      },
      consentLogs: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          actorUserId: true,
          consentType: true,
          granted: true,
          notes: true,
          createdAt: true,
        },
      },
      consentActions: {
        select: {
          id: true,
          userId: true,
          consentType: true,
          granted: true,
          notes: true,
          createdAt: true,
        },
      },
      coachingPlans: {
        select: {
          id: true,
          drillDefinitionId: true,
          sourceSubmissionId: true,
          status: true,
          weaknesses: true,
          recommendations: true,
          confidenceScore: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      reportsFiled: {
        select: {
          id: true,
          submissionId: true,
          reason: true,
          details: true,
          status: true,
          reviewedAt: true,
          createdAt: true,
        },
      },
      reportsReviewed: {
        select: {
          id: true,
          reporterId: true,
          submissionId: true,
          reason: true,
          details: true,
          status: true,
          reviewedAt: true,
          createdAt: true,
        },
      },
      validationSubmissions: true,
      validationApprovals: true,
      manualOverrides: true,
      exportRequests: {
        select: { status: true, requestedAt: true, completedAt: true },
      },
      notifications: {
        select: { type: true, title: true, body: true, actionHref: true, readAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      billingAccount: {
        select: {
          stripeCustomerId: true,
          createdAt: true,
          subscription: {
            select: {
              stripeSubscriptionId: true,
              priceId: true,
              status: true,
              currentPeriodEnd: true,
              graceUntil: true,
              cancelAtPeriodEnd: true,
            },
          },
        },
      },
    },
  });

  if (!payload) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const exportRequest = await transaction.dataExportRequest.create({
        data: {
          userId: session.user.id,
          status: "REQUESTED",
        },
      });

      await transaction.dataExportRequest.update({
        where: { id: exportRequest.id },
        data: {
          status: "READY",
          completedAt: new Date(),
        },
      });

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Data export generated",
          metadata: {
            action: "DATA_EXPORT_GENERATED",
            actorUserId: session.user.id,
            exportRequestId: exportRequest.id,
          },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Export could not be recorded safely." }, { status: 503 });
  }

  const modelTrainingConsentHistory = payload.consentLogs.filter(
    (log) => log.consentType === "MODEL_TRAINING",
  );

  return NextResponse.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    data: {
      ...payload,
      modelTrainingConsent: {
        granted: modelTrainingConsentHistory[0]?.granted ?? false,
        history: modelTrainingConsentHistory,
      },
    },
  });
}
