import { prisma } from "@/lib/prisma";

export async function recordWorkerStarted(workerId: string, now = new Date()) {
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: {
      workerId,
      status: "RUNNING",
      startedAt: now,
      lastSeenAt: now,
      processedTotal: 0,
      errorTotal: 0,
    },
    update: {
      status: "RUNNING",
      startedAt: now,
      lastSeenAt: now,
    },
  });
}

export async function recordWorkerBatch(
  workerId: string,
  result: { completed: number; failed: number },
  now = new Date(),
) {
  await prisma.workerHeartbeat.update({
    where: { workerId },
    data: {
      status: "RUNNING",
      lastSeenAt: now,
      processedTotal: { increment: result.completed + result.failed },
      errorTotal: { increment: result.failed },
    },
  });
}

export async function recordWorkerError(workerId: string, now = new Date()) {
  await prisma.workerHeartbeat.update({
    where: { workerId },
    data: {
      status: "RUNNING",
      lastSeenAt: now,
      errorTotal: { increment: 1 },
    },
  });
}

export async function recordWorkerStopped(workerId: string, now = new Date()) {
  await prisma.workerHeartbeat.update({
    where: { workerId },
    data: { status: "STOPPED", lastSeenAt: now },
  });
}

export async function getWorkerHealth(now = new Date(), staleAfterMs = 90_000) {
  const [records, totals] = await Promise.all([
    prisma.workerHeartbeat.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    }),
    prisma.workerHeartbeat.aggregate({
      _sum: { processedTotal: true, errorTotal: true },
    }),
  ]);
  const workers = records.map((worker) => {
    const health = worker.status !== "RUNNING"
      ? "STOPPED" as const
      : now.getTime() - worker.lastSeenAt.getTime() > staleAfterMs
        ? "STALE" as const
        : "ACTIVE" as const;
    return { ...worker, health };
  });
  return {
    activeCount: workers.filter((worker) => worker.health === "ACTIVE").length,
    staleCount: workers.filter((worker) => worker.health === "STALE").length,
    processedTotal: totals._sum.processedTotal ?? 0,
    errorTotal: totals._sum.errorTotal ?? 0,
    workers,
  };
}
