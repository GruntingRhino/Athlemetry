import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionKeyMomentSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = submissionKeyMomentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reviewed key moment." }, { status: 400 });
  }

  const { id: submissionId } = await params;
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const submission = await transaction.drillSubmission.findUnique({
        where: { id: submissionId },
        select: { processingStatus: true },
      });
      if (!submission) return "missing" as const;
      if (submission.processingStatus !== "COMPLETED") return "not-completed" as const;

      const keyMoment = await transaction.submissionKeyMoment.create({
        data: { submissionId, reviewerId: session.user.id, ...parsed.data },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Submission key moment reviewed",
          metadata: {
            action: "SUBMISSION_KEY_MOMENT_REVIEWED",
            actorUserId: session.user.id,
            submissionId,
            keyMomentId: keyMoment.id,
          },
        },
      });
      return keyMoment;
    });

    if (result === "missing") return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    if (result === "not-completed") return NextResponse.json({ error: "Only completed submissions can receive reviewed key moments." }, { status: 409 });
    return NextResponse.json({ ok: true, keyMoment: result });
  } catch {
    return NextResponse.json({ error: "Reviewed key moment could not be recorded safely." }, { status: 503 });
  }
}
