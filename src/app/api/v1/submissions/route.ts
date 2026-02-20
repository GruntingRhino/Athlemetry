import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const submissions = await prisma.drillSubmission.findMany({
    where: {
      athleteId: session.user.id,
    },
    include: {
      drillDefinition: true,
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  return NextResponse.json({
    data: submissions,
    meta: {
      count: submissions.length,
      version: "v1",
    },
  });
}
