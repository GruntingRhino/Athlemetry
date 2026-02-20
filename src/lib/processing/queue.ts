import { ProcessingStatus } from "@prisma/client";

import { recalculateBenchmarksForSubmission } from "@/lib/benchmarking";
import { extractMetrics } from "@/lib/metrics/engine";
import { prisma } from "@/lib/prisma";
import {
  purgeStoredVideo,
  shouldPurgeOnTerminalFailure,
} from "@/lib/storage";

async function activeModelVersion() {
  const model = await prisma.modelVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return model?.version ?? "v1.0.0";
}

async function markVideoPurged(submissionId: string) {
  await prisma.drillSubmission.update({
    where: { id: submissionId },
    data: {
      fileUrl: null,
      videoDeletedAt: new Date(),
      videoPurgeError: null,
    },
  });
}

async function markVideoPurgeError(submissionId: string, message: string) {
  await prisma.drillSubmission.update({
    where: { id: submissionId },
    data: {
      videoPurgeError: message,
    },
  });
}

async function purgeVideoForSubmission(params: {
  submissionId: string;
  storageProvider: string | null;
  storageKey: string | null;
}) {
  try {
    const purgeResult = await purgeStoredVideo({
      storageProvider: params.storageProvider,
      storageKey: params.storageKey,
    });

    if (!purgeResult.ok) {
      await markVideoPurgeError(params.submissionId, purgeResult.reason);
      return;
    }

    await markVideoPurged(params.submissionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video purge failed.";
    await markVideoPurgeError(params.submissionId, message);

    await prisma.systemLog.create({
      data: {
        level: "WARN",
        category: "video-purge",
        message,
        metadata: {
          submissionId: params.submissionId,
        },
      },
    });
  }
}

async function maybePurgeAfterCompletion(params: {
  submissionId: string;
  storageProvider: string | null;
  storageKey: string | null;
  retainVideoForAudit: boolean;
}) {
  if (params.retainVideoForAudit) {
    return;
  }

  await purgeVideoForSubmission(params);
}

async function maybePurgeAfterTerminalFailure(params: {
  submissionId: string;
  storageProvider: string | null;
  storageKey: string | null;
  retainVideoForAudit: boolean;
}) {
  if (!shouldPurgeOnTerminalFailure(params.retainVideoForAudit)) {
    return;
  }

  await purgeVideoForSubmission(params);
}

export async function processSubmission(submissionId: string) {
  const submission = await prisma.drillSubmission.findUnique({
    where: { id: submissionId },
    include: {
      drillDefinition: true,
    },
  });

  if (!submission) {
    return { ok: false as const, reason: "Submission not found." };
  }

  const start = Date.now();

  await prisma.drillSubmission.update({
    where: { id: submissionId },
    data: {
      processingStatus: ProcessingStatus.PROCESSING,
      startedAt: new Date(),
      processingAttempts: { increment: 1 },
    },
  });

  try {
    const metrics = extractMetrics({
      drillSlug: submission.drillDefinition.slug,
      frameRate: submission.frameRate,
      startFrame: submission.startFrame,
      finishFrame: submission.finishFrame,
      repetitionHint: submission.repetitionHint,
      fileSize: submission.fileSize,
    });

    const modelVersion = await activeModelVersion();

    await prisma.metricResult.upsert({
      where: { submissionId },
      update: {
        ...metrics,
        metricVersion: modelVersion,
        normalizedScore: null,
      },
      create: {
        submissionId,
        metricVersion: modelVersion,
        ...metrics,
        normalizedScore: null,
      },
    });

    await prisma.drillSubmission.update({
      where: { id: submissionId },
      data: {
        processingStatus: ProcessingStatus.COMPLETED,
        completedAt: new Date(),
        uploadProgress: 100,
        lastError: null,
      },
    });

    await prisma.processingLog.create({
      data: {
        submissionId,
        status: ProcessingStatus.COMPLETED,
        message: "Metrics extracted successfully.",
        attempt: submission.processingAttempts + 1,
        durationMs: Date.now() - start,
      },
    });

    await recalculateBenchmarksForSubmission(submissionId);

    await maybePurgeAfterCompletion({
      submissionId,
      storageProvider: submission.storageProvider,
      storageKey: submission.storageKey,
      retainVideoForAudit: submission.retainVideoForAudit,
    });

    return { ok: true as const };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown processing error.";

    const isTerminalFailure = submission.processingAttempts + 1 >= 3;

    const failed = await prisma.drillSubmission.update({
      where: { id: submissionId },
      data: {
        processingStatus: isTerminalFailure ? "FAILED" : "RETRYING",
        lastError: err,
      },
      select: {
        id: true,
        processingAttempts: true,
      },
    });

    await prisma.processingLog.create({
      data: {
        submissionId,
        status: isTerminalFailure ? "FAILED" : "RETRYING",
        message: err,
        attempt: failed.processingAttempts,
        durationMs: Date.now() - start,
      },
    });

    if (isTerminalFailure) {
      await maybePurgeAfterTerminalFailure({
        submissionId,
        storageProvider: submission.storageProvider,
        storageKey: submission.storageKey,
        retainVideoForAudit: submission.retainVideoForAudit,
      });
    }

    return { ok: false as const, reason: err };
  }
}

export async function purgeExpiredVideos(limit = 100) {
  const expired = await prisma.drillSubmission.findMany({
    where: {
      videoDeletedAt: null,
      videoExpiresAt: {
        lte: new Date(),
      },
      storageKey: {
        not: null,
      },
      retainVideoForAudit: false,
    },
    orderBy: {
      videoExpiresAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      storageProvider: true,
      storageKey: true,
    },
  });

  let purged = 0;
  for (const item of expired) {
    await purgeVideoForSubmission({
      submissionId: item.id,
      storageProvider: item.storageProvider,
      storageKey: item.storageKey,
    });

    purged += 1;
  }

  if (purged > 0) {
    await prisma.systemLog.create({
      data: {
        level: "INFO",
        category: "video-purge",
        message: `Purged ${purged} expired video assets.`,
      },
    });
  }

  return { purged };
}

export async function runProcessingBatch(limit = 10) {
  const queued = await prisma.drillSubmission.findMany({
    where: {
      OR: [
        { processingStatus: ProcessingStatus.QUEUED },
        { processingStatus: ProcessingStatus.RETRYING },
      ],
      processingAttempts: {
        lt: 3,
      },
    },
    orderBy: {
      queuedAt: "asc",
    },
    take: limit,
  });

  const results = [];
  for (const item of queued) {
    // Sequential processing is intentional to keep memory bounded in free-tier environments.
    const result = await processSubmission(item.id);
    results.push({ submissionId: item.id, ...result });
  }

  const completed = results.filter((item) => item.ok).length;
  const failed = results.length - completed;

  const purgeSummary = await purgeExpiredVideos(100);

  await prisma.systemLog.create({
    data: {
      level: failed > 0 ? "WARN" : "INFO",
      category: "processing-batch",
      message: `Processed ${results.length} queued submissions.`,
      metadata: {
        completed,
        failed,
        purgedExpiredVideos: purgeSummary.purged,
      },
    },
  });

  return {
    total: results.length,
    completed,
    failed,
    purgedExpiredVideos: purgeSummary.purged,
    results,
  };
}
