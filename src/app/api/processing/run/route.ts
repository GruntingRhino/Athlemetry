import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { runProcessingBatch } from "@/lib/processing/queue";
import { isWorkerTokenAuthorized } from "@/lib/worker-auth";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workerAuthorized = isWorkerTokenAuthorized(request.headers.get("authorization"));
  if (!workerAuthorized && !assertRole(session?.user.role, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = typeof payload.limit === "number" ? Math.min(Math.max(payload.limit, 1), 50) : 10;

  if (!workerAuthorized) {
    try {
      await prisma.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Processing batch initiated",
          metadata: { action: "PROCESSING_BATCH_INITIATED", actorUserId: session!.user.id, limit },
        },
      });
    } catch {
      return NextResponse.json({ error: "Processing batch could not be initiated safely." }, { status: 503 });
    }
  }

  const result = await runProcessingBatch(limit);
  return NextResponse.json({ ok: true, ...result });
}
