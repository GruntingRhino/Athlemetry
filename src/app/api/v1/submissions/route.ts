import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canUsePaidFeatures } from "@/lib/billing";
import {
  filterCustomerMetricResult,
  isMetricReleased,
  sanitizeCustomerMetadata,
} from "@/lib/customer-metrics";
import { prisma } from "@/lib/prisma";

const INTERNAL_SUBMISSION_FIELDS = new Set(["storageKey", "videoHash", "fileUrl"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!await canUsePaidFeatures(session.user.id, session.user.role)) {
    return NextResponse.json({ error: "An active subscription is required." }, { status: 402 });
  }

  const submissions = await prisma.drillSubmission.findMany({
    where: {
      athleteId: session.user.id,
    },
    include: {
      drillDefinition: {
        include: { metricValidations: true },
      },
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  const customerSubmissions = submissions.map((submission) => {
    const releasedMetricNames = new Set(
      submission.drillDefinition.metricValidations
        .filter((validation) => isMetricReleased(submission.drillDefinition.slug, validation.metricName, submission.metricResult?.metricVersion ?? "unavailable", validation))
        .map((validation) => validation.metricName),
    );
    const customerMetricResult = filterCustomerMetricResult(
      submission.metricResult as unknown as Record<string, unknown> | null,
      releasedMetricNames,
      submission.metadata,
      submission.drillDefinition.slug,
    );
    const captureReleasedMetricNames = new Set(
      [...releasedMetricNames].filter((metricName) => {
        const value = customerMetricResult?.[metricName];
        return typeof value === "number" && Number.isFinite(value);
      }),
    );
    const primaryReleased = captureReleasedMetricNames.has(submission.drillDefinition.metricPrimaryKey);
    const drillDefinition = Object.fromEntries(
      Object.entries(submission.drillDefinition).filter(([key]) => key !== "metricValidations"),
    );
    const customerSubmission = Object.fromEntries(
      Object.entries(submission).filter(([key]) => !INTERNAL_SUBMISSION_FIELDS.has(key)),
    );

    return {
      ...customerSubmission,
      metadata: sanitizeCustomerMetadata(submission.metadata),
      drillDefinition,
      metricResult: customerMetricResult,
      benchmarkSnapshots: primaryReleased && customerMetricResult ? submission.benchmarkSnapshots : null,
      metricRelease: {
        primaryReleased,
        releasedMetricNames: [...captureReleasedMetricNames],
      },
    };
  });

  return NextResponse.json({
    data: customerSubmissions,
    meta: {
      count: customerSubmissions.length,
      version: "v1",
    },
  });
}
