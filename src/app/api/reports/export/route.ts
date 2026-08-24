import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canUsePaidFeatures } from "@/lib/billing";
import { buildCustomerReports } from "@/lib/customer-reports";
import { checkDatabaseRateLimit } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!await canUsePaidFeatures(session.user.id, session.user.role)) {
    return NextResponse.json({ error: "A paid membership is required to export reports." }, { status: 402 });
  }

  try {
    const rateLimit = await checkDatabaseRateLimit({
      namespace: "customer-report-export",
      identifier: session.user.id,
      windowMs: 60 * 60_000,
      maxRequests: 3,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many report exports. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
  } catch {
    return NextResponse.json({ error: "Report export protection is temporarily unavailable." }, { status: 503 });
  }

  const submissions = await prisma.drillSubmission.findMany({
    where: { athleteId: session.user.id, processingStatus: "COMPLETED" },
    include: {
      drillDefinition: { include: { metricValidations: true } },
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: { recordingDate: "desc" },
  });
  const reports = buildCustomerReports(submissions.map((submission) => ({
    ...submission,
    metricResult: submission.metricResult ? { ...submission.metricResult } : null,
  })));

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Customer reports exported",
          metadata: { action: "CUSTOMER_REPORTS_EXPORTED", actorUserId: session.user.id },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Report export could not be recorded safely." }, { status: 503 });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    reports: reports.map(({ submission, values }) => ({
      submissionId: submission.id,
      drill: submission.drillDefinition.name,
      recordingDate: submission.recordingDate.toISOString(),
      location: submission.location,
      benchmarkPercentile: submission.benchmarkSnapshots?.percentile ?? null,
      metrics: values.map(({ key, value, presentation, evidenceTimestamp }) => ({
        key,
        label: presentation.label,
        value,
        unit: presentation.unit,
        definition: presentation.definition,
        evidenceVerifiedAt: evidenceTimestamp,
      })),
    })),
  });
}
