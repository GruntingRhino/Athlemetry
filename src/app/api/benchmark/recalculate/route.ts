import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { recalculateBenchmarksForSubmission } from "@/lib/benchmarking";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const submissions = await prisma.drillSubmission.findMany({
    where: {
      processingStatus: "COMPLETED",
      metricResult: { isNot: null },
    },
    select: { id: true },
    take: 500,
  });

  for (const submission of submissions) {
    await recalculateBenchmarksForSubmission(submission.id);
  }

  return NextResponse.json({ ok: true, recalculated: submissions.length });
}
