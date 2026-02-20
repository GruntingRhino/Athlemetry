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
    include: {
      submissions: {
        include: {
          metricResult: true,
          benchmarkSnapshots: true,
        },
      },
      consentLogs: true,
      exportRequests: true,
    },
  });

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
