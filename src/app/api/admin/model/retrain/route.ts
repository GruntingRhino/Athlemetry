import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { modelRetrainingRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = modelRetrainingRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid retraining request." }, { status: 400 });
  }

  try {
    const job = await prisma.$transaction(async (transaction) => {
      const createdJob = await transaction.retrainingJob.create({
        data: {
          requestedBy: session.user.id,
          status: "QUEUED",
          notes: payload.data.notes ?? "Manual retraining request.",
        },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Model retraining requested",
          metadata: {
            action: "MODEL_RETRAINING_REQUESTED",
            actorUserId: session.user.id,
            retrainingJobId: createdJob.id,
          },
        },
      });
      return createdJob;
    });

    return NextResponse.json({ ok: true, job });
  } catch {
    return NextResponse.json({ error: "Retraining request could not be recorded safely." }, { status: 503 });
  }
}
