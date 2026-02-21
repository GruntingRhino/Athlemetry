import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const exportRequest = await prisma.dataExportRequest.create({
    data: {
      userId: session.user.id,
      status: "REQUESTED",
    },
  });

  const payload = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      age: true,
      position: true,
      team: true,
      competitionLevel: true,
      gender: true,
      parentEmail: true,
      parentConsentVerified: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      submissions: {
        select: {
          id: true,
          submittedAt: true,
          recordingDate: true,
          location: true,
          drillType: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          processingStatus: true,
          lastError: true,
          frameRate: true,
          startFrame: true,
          finishFrame: true,
          repetitionHint: true,
          metadata: true,
          metricResult: true,
          benchmarkSnapshots: true,
        },
      },
      consentLogs: true,
      exportRequests: true,
    },
  });

  if (!payload) {
    await prisma.dataExportRequest.update({
      where: { id: exportRequest.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  await prisma.dataExportRequest.update({
    where: { id: exportRequest.id },
    data: {
      status: "READY",
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    data: payload,
  });
}
