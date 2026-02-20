import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { notes?: string };

  const job = await prisma.retrainingJob.create({
    data: {
      requestedBy: session.user.id,
      status: "QUEUED",
      notes: payload.notes || "Manual retraining request.",
    },
  });

  await prisma.systemLog.create({
    data: {
      level: "INFO",
      category: "model-retraining",
      message: `Retraining job queued: ${job.id}`,
    },
  });

  return NextResponse.json({ ok: true, job });
}
