import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { isCoachingActionIndexValid } from "@/lib/coaching-plans";
import { hasReleasedMetricValue, isMetricReleased } from "@/lib/customer-metrics";
import { checkDatabaseRateLimit, rateLimitSource } from "@/lib/distributed-rate-limit";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { prisma } from "@/lib/prisma";
import { reportSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const sourceLimit = await checkDatabaseRateLimit({
      namespace: "submission-report-source",
      identifier: rateLimitSource(request.headers),
      windowMs: 60 * 60_000,
      maxRequests: 20,
    });
    if (!sourceLimit.allowed) {
      return NextResponse.json({ error: "Too many reports. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(sourceLimit.retryAfterSeconds) },
      });
    }

    const accountLimit = await checkDatabaseRateLimit({
      namespace: "submission-report-account",
      identifier: session.user.id,
      windowMs: 60 * 60_000,
      maxRequests: 10,
    });
    if (!accountLimit.allowed) {
      return NextResponse.json({ error: "Too many reports. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(accountLimit.retryAfterSeconds) },
      });
    }
  } catch {
    return NextResponse.json({ error: "Report protection is temporarily unavailable." }, { status: 503 });
  }

  const payload = await request.json();
  const parsed = reportSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.reportedValue !== undefined && !parsed.data.metricName) {
    return NextResponse.json({ error: "A corrected value requires a released metric scope." }, { status: 400 });
  }

  if (parsed.data.submissionId) {
    const submission = await prisma.drillSubmission.findFirst({
      where: {
        id: parsed.data.submissionId,
        ...(session.user.role === "ADMIN" ? {} : { athleteId: session.user.id }),
      },
      include: {
        drillDefinition: { include: { metricValidations: true } },
        metricResult: true,
      },
    });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    if (parsed.data.metricName) {
      const releasedMetricNames = new Set(
        submission.drillDefinition.metricValidations
          .filter((validation) => isMetricReleased(
            submission.drillDefinition.slug,
            validation.metricName,
            submission.metricResult?.metricVersion ?? "unavailable",
            validation,
          ))
          .map((validation) => validation.metricName),
      );
      const protocol = DRILL_PROTOCOLS[submission.drillDefinition.slug as keyof typeof DRILL_PROTOCOLS];
      const isReportable = parsed.data.metricName === submission.drillDefinition.metricPrimaryKey
        && hasReleasedMetricValue(
          submission.metricResult ? { ...submission.metricResult } : null,
          releasedMetricNames,
          parsed.data.metricName,
          submission.metadata,
          protocol?.version ?? "unavailable",
        );
      if (!isReportable) {
        return NextResponse.json({ error: "That metric is not available for review on this submission." }, { status: 400 });
      }
    }
  }

  if (parsed.data.coachingPlanId) {
    const coachingPlan = await prisma.coachingPlan.findFirst({
      where: { id: parsed.data.coachingPlanId, athleteId: session.user.id, status: "ACTIVE" },
      select: { id: true, recommendations: true },
    });
    if (!coachingPlan || !isCoachingActionIndexValid(coachingPlan.recommendations, parsed.data.recommendationActionIndex ?? -1)) {
      return NextResponse.json({ error: "Coaching recommendation not found." }, { status: 404 });
    }
  }

  let report;
  try {
    report = await prisma.$transaction(async (transaction) => {
      const createdReport = await transaction.userReport.create({
        data: {
          reporterId: session.user.id,
          submissionId: parsed.data.submissionId,
          ...(parsed.data.coachingPlanId ? {
            coachingPlanId: parsed.data.coachingPlanId,
            recommendationActionIndex: parsed.data.recommendationActionIndex,
          } : {}),
          ...(parsed.data.metricName ? { metricName: parsed.data.metricName } : {}),
          ...(parsed.data.reportedValue !== undefined ? { reportedValue: parsed.data.reportedValue } : {}),
          ...(parsed.data.disputedFrameIndex !== undefined ? { disputedFrameIndex: parsed.data.disputedFrameIndex } : {}),
          ...(parsed.data.accuracyRating !== undefined ? { accuracyRating: parsed.data.accuracyRating } : {}),
          ...(parsed.data.usefulnessRating !== undefined ? { usefulnessRating: parsed.data.usefulnessRating } : {}),
          requestType: parsed.data.requestType,
          reason: parsed.data.reason,
          details: parsed.data.details,
        },
      });

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Submission report filed",
          metadata: {
            action: "SUBMISSION_REPORT_FILED",
            actorUserId: session.user.id,
            reportId: createdReport.id,
          },
        },
      });

      return createdReport;
    });
  } catch {
    return NextResponse.json({ error: "Report could not be recorded safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, report });
}
