import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const submission = await prisma.drillSubmission.findUnique({
    where: { id },
    include: {
      metricResult: true,
      benchmarkSnapshots: true,
      processingLogs: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && submission.athleteId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ submission });
}
