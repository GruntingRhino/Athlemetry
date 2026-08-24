import { prisma } from "@/lib/prisma";

export async function getQueueOperationsSnapshot(now = new Date()) {
  const [queued, retrying, processing, deadLettered, oldestReady, deadLetters] = await Promise.all([
    prisma.drillSubmission.count({ where: { processingStatus: "QUEUED" } }),
    prisma.drillSubmission.count({ where: { processingStatus: "RETRYING" } }),
    prisma.drillSubmission.count({ where: { processingStatus: "PROCESSING" } }),
    prisma.drillSubmission.count({ where: { deadLetteredAt: { not: null } } }),
    prisma.drillSubmission.findFirst({
      where: {
        deadLetteredAt: null,
        OR: [
          { processingStatus: "QUEUED" },
          { processingStatus: "RETRYING", nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: { queuedAt: "asc" },
      select: { queuedAt: true },
    }),
    prisma.drillSubmission.findMany({
      where: { deadLetteredAt: { not: null } },
      orderBy: { deadLetteredAt: "desc" },
      take: 25,
      select: {
        id: true,
        fileName: true,
        processingAttempts: true,
        lastError: true,
        deadLetteredAt: true,
        drillDefinition: { select: { name: true, sport: true } },
        athlete: { select: { email: true } },
      },
    }),
  ]);

  return {
    queued,
    retrying,
    processing,
    deadLettered,
    oldestReadyLagSeconds: oldestReady
      ? Math.max(0, Math.floor((now.getTime() - oldestReady.queuedAt.getTime()) / 1000))
      : 0,
    deadLetters,
  };
}

export async function requeueDeadLetter(submissionId: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const reset = await tx.drillSubmission.updateMany({
      where: { id: submissionId, deadLetteredAt: { not: null } },
      data: {
        processingStatus: "QUEUED",
        processingAttempts: 0,
        nextAttemptAt: null,
        deadLetteredAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        queuedAt: new Date(),
      },
    });
    if (reset.count !== 1) {
      return { ok: false as const, reason: "Submission is not dead-lettered." };
    }

    await tx.processingLog.create({
      data: {
        submissionId,
        status: "QUEUED",
        message: "Dead-lettered submission manually requeued by an administrator.",
        attempt: 0,
      },
    });
    await tx.systemLog.create({
      data: {
        level: "WARN",
        category: "SECURITY_AUDIT",
        message: "An administrator manually requeued a dead-lettered submission.",
        metadata: {
          action: "DEAD_LETTER_REQUEUED",
          actorUserId: adminId,
          submissionId,
        },
      },
    });
    return { ok: true as const };
  });
}
