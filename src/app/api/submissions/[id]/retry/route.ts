import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processSubmission } from "@/lib/processing/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const submission = await prisma.drillSubmission.findUnique({ where: { id } });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && submission.athleteId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (submission.processingStatus !== "FAILED") {
    return NextResponse.json(
      { error: "Only failed submissions can be retried." },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.drillSubmission.update({
        where: { id },
        data: {
          processingStatus: "QUEUED",
          processingAttempts: 0,
          queuedAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
          deadLetteredAt: null,
        },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Submission retry requested",
          metadata: {
            action: "SUBMISSION_RETRY_REQUESTED",
            actorUserId: session.user.id,
            submissionId: id,
          },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Retry could not be recorded safely." }, { status: 503 });
  }

  if (process.env.INLINE_PROCESSING_ENABLED !== "true") {
    return NextResponse.json({ ok: true, queued: true }, { status: 202 });
  }

  const result = await processSubmission(id);
  return NextResponse.json({ ok: true, result });
}
