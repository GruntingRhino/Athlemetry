import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
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

  await prisma.manualOverride.create({
    data: {
      submissionId: data.submissionId,
      adminId: session.user.id,
      action: data.action,
      notes: data.notes,
      payload: data,
    },
  });

  if (data.processingStatus) {
    await prisma.drillSubmission.update({
      where: { id: data.submissionId },
      data: {
        processingStatus: data.processingStatus,
      },
    });
  }

  await prisma.metricResult.upsert({
    where: { submissionId: data.submissionId },
    update: {
      sprintTime: data.sprintTime,
      accelerationTiming: data.accelerationTiming,
      changeOfDirectionMeasurement: data.changeOfDirectionMeasurement,
      shotTiming: data.shotTiming,
      repetitionCount: data.repetitionCount,
      consistencyScore: data.consistencyScore,
    },
    create: {
      submissionId: data.submissionId,
      metricVersion: "manual-override",
      sprintTime: data.sprintTime,
      accelerationTiming: data.accelerationTiming,
      changeOfDirectionMeasurement: data.changeOfDirectionMeasurement,
      shotTiming: data.shotTiming,
      repetitionCount: data.repetitionCount,
      consistencyScore: data.consistencyScore,
    },
  });

  return NextResponse.json({ ok: true });
}
