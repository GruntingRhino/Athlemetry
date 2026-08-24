import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canUsePaidFeatures } from "@/lib/billing";
import { isMetricReleased } from "@/lib/customer-metrics";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!await canUsePaidFeatures(session.user.id, session.user.role)) {
    return NextResponse.json({ error: "An active subscription is required." }, { status: 402 });
  }

  const snapshots = await prisma.benchmarkSnapshot.findMany({
    where: {
      athleteId: session.user.id,
    },
    include: {
      submission: {
        include: {
          drillDefinition: {
            include: { metricValidations: true },
          },
          metricResult: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const anonymized = snapshots.filter((snapshot) => {
    const drill = snapshot.submission.drillDefinition;
    const modelVersion = snapshot.submission.metricResult?.metricVersion ?? "unavailable";
    const validation = drill.metricValidations.find((item) => item.metricName === drill.metricPrimaryKey && item.modelVersion === modelVersion);
    return isMetricReleased(drill.slug, drill.metricPrimaryKey, modelVersion, validation);
  }).map((snapshot) => ({
    id: snapshot.id,
    percentile: snapshot.percentile,
    relativeRank: snapshot.relativeRank,
    normalizedScore: snapshot.normalizedScore,
    cohortKey: snapshot.cohortKey,
    submission: {
      id: snapshot.submission.id,
      drillType: snapshot.submission.drillType,
      submittedAt: snapshot.submission.submittedAt,
      sport: snapshot.submission.drillDefinition.sport,
    },
  }));

  return NextResponse.json({
    data: anonymized,
    meta: {
      count: anonymized.length,
      anonymized: true,
      version: "v1",
    },
  });
}
