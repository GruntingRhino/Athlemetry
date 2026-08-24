import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { purgeStaleRateLimits } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";
import { isWorkerTokenAuthorized } from "@/lib/worker-auth";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workerAuthorized = isWorkerTokenAuthorized(request.headers.get("authorization"));
  const administratorAuthorized = assertRole(session?.user.role, ["ADMIN"]);
  if (!workerAuthorized && !administratorAuthorized) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (administratorAuthorized) {
    try {
      await prisma.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Expired rate-limit windows purge initiated",
          metadata: { action: "RATE_LIMIT_WINDOWS_PURGE_INITIATED", actorUserId: session!.user.id },
        },
      });
    } catch {
      return NextResponse.json({ error: "Rate-limit cleanup could not be initiated safely." }, { status: 503 });
    }
  }

  try {
    const deleted = await purgeStaleRateLimits();
    return NextResponse.json({ ok: true, deleted });
  } catch {
    return NextResponse.json({ error: "Rate-limit cleanup is temporarily unavailable." }, { status: 503 });
  }
}