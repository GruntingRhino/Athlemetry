import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { enqueueBenchmarkRebuilds, findBenchmarkRebuildTargets } from "@/lib/benchmark-rebuild";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let queued: number;
  try {
    queued = await prisma.$transaction(async (tx) => {
      const targets = await findBenchmarkRebuildTargets(tx);
      await enqueueBenchmarkRebuilds(tx, targets);
      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Benchmark rebuilds queued",
          metadata: {
            action: "BENCHMARK_REBUILDS_QUEUED",
            actorUserId: session.user.id,
            queued: targets.length,
          },
        },
      });
      return targets.length;
    });
  } catch {
    return NextResponse.json({ error: "Benchmark rebuild scheduling could not be recorded safely." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued }, { status: 202 });
}
