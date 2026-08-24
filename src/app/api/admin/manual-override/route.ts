import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { invalidateManualOverrideEvidence } from "@/lib/manual-override";
import { prisma } from "@/lib/prisma";
import { manualOverrideSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = manualOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const metricValues = {
    sprintTime: data.sprintTime,
    accelerationTiming: data.accelerationTiming,
    changeOfDirectionMeasurement: data.changeOfDirectionMeasurement,
    shotTiming: data.shotTiming,
    repetitionCount: data.repetitionCount,
    consistencyScore: data.consistencyScore,
  };
  const changesMetrics = Object.values(metricValues).some((value) => value !== undefined);
  let applied: boolean;
  try {
    applied = await prisma.$transaction(async (tx) => {
      const submission = await tx.drillSubmission.findUnique({
        where: { id: data.submissionId },
        select: { metadata: true },
      });
      if (!submission) return false;

      await tx.manualOverride.create({
        data: {
          submissionId: data.submissionId,
          adminId: session.user.id,
          action: data.action,
          notes: data.notes,
          payload: data,
        },
      });
      if (data.processingStatus || changesMetrics) {
        await tx.drillSubmission.update({
          where: { id: data.submissionId },
          data: {
            ...(data.processingStatus ? { processingStatus: data.processingStatus } : {}),
            ...(changesMetrics ? { metadata: invalidateManualOverrideEvidence(submission.metadata) } : {}),
          },
        });
      }
      if (changesMetrics) {
        await tx.metricResult.upsert({
          where: { submissionId: data.submissionId },
          update: metricValues,
          create: {
            submissionId: data.submissionId,
            metricVersion: "manual-override",
            ...metricValues,
          },
        });
        await tx.benchmarkSnapshot.deleteMany({ where: { submissionId: data.submissionId } });
        await tx.coachingPlan.updateMany({
          where: { sourceSubmissionId: data.submissionId, status: "ACTIVE" },
          data: { status: "ARCHIVED" },
        });
      }
      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Manual override applied",
          metadata: {
            action: "MANUAL_OVERRIDE_APPLIED",
            actorUserId: session.user.id,
            submissionId: data.submissionId,
          },
        },
      });
      return true;
    });
  } catch {
    return NextResponse.json({ error: "Manual override could not be recorded safely." }, { status: 503 });
  }
  if (!applied) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
