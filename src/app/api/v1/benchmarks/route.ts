import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const snapshots = await prisma.benchmarkSnapshot.findMany({
    where: {
      athleteId: session.user.id,
    },
    include: {
      submission: {
        include: {
          drillDefinition: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const anonymized = snapshots.map((snapshot) => ({
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
