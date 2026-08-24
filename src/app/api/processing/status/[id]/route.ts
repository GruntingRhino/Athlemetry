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
    select: {
      id: true,
      athleteId: true,
      processingStatus: true,
      processingAttempts: true,
      nextAttemptAt: true,
      deadLetteredAt: true,
      uploadProgress: true,
      queuedAt: true,
      startedAt: true,
      completedAt: true,
      processingLogs: {
        orderBy: {
          createdAt: "desc",
        },
        select: { status: true, attempt: true, durationMs: true, createdAt: true },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && submission.athleteId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    submission: {
      id: submission.id,
      processingStatus: submission.processingStatus,
      processingAttempts: submission.processingAttempts,
      nextAttemptAt: submission.nextAttemptAt,
      deadLetteredAt: submission.deadLetteredAt,
      uploadProgress: submission.uploadProgress,
      queuedAt: submission.queuedAt,
      startedAt: submission.startedAt,
      completedAt: submission.completedAt,
      processingLogs: submission.processingLogs,
    },
  });
}
