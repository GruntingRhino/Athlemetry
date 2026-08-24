import { ProcessingStatus } from "@prisma/client";

import { buildAnalysisSummary } from "@/lib/analysis-summary";
import { assessCaptureAdherence } from "@/lib/capture-adherence";
import { backfillCoachingPlans, upsertCoachingPlanForSubmission } from "@/lib/coaching-plans";
import { isPrimaryMetricReleased } from "@/lib/customer-metrics";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { scheduleEngagementNotifications } from "@/lib/engagement";
import { verifiedOutcomeEvidence } from "@/lib/outcome-evidence";
import { buildPerformanceAssessment, resolveAnalyzerModelVersion } from "@/lib/performance-verification";
import { claimReadySubmissionIds } from "@/lib/processing/queue-claim";
import { processingRetryDecision } from "@/lib/processing/retry-policy";
import { recalculateBenchmarksForSubmission } from "@/lib/benchmarking";
import { prisma } from "@/lib/prisma";
import {
  getFailedDebugExpiryDate,
  getReviewExpiryDate,
  materializeStoredVideo,
  purgeStoredVideo,
  verifyMaterializedVideoHash,
} from "@/lib/storage";
import {
  mapVisionAnalysisToMetrics,
  runVisionAnalysis,
  verifiedCameraCalibration,
  verifiedCalibrationDistance,
  verifiedPlanarCalibration,
} from "@/lib/vision-analysis";

async function activeModelVersion() {
  const model = await prisma.modelVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return model?.version ?? null;
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
  reviewRetentionDays: number;
}) {
  if (params.reviewRetentionDays > 0) {
    await prisma.drillSubmission.update({
      where: { id: params.submissionId },
      data: { videoExpiresAt: getReviewExpiryDate(params.reviewRetentionDays as 0 | 7 | 30 | 90) },
    });
    return;
  }

  await purgeVideoForSubmission(params);
}

async function maybePurgeAfterTerminalFailure(params: {
  submissionId: string;
  storageProvider: string | null;
  storageKey: string | null;
}) {
  await prisma.drillSubmission.update({
    where: { id: params.submissionId },
    data: { videoExpiresAt: getFailedDebugExpiryDate() },
  });
}

async function processSubmissionInternal(submissionId: string, alreadyClaimed: boolean) {
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
  const claimTime = new Date(start);
  const staleBefore = new Date(start - 15 * 60 * 1000);
  let cleanupMaterializedVideo: (() => Promise<void>) | null = null;

  if (!alreadyClaimed) {
    const claim = await prisma.drillSubmission.updateMany({
      where: {
        id: submissionId,
        OR: [
          { processingStatus: ProcessingStatus.QUEUED },
          { processingStatus: ProcessingStatus.RETRYING, nextAttemptAt: { lte: claimTime } },
          { processingStatus: ProcessingStatus.PROCESSING, startedAt: { lte: staleBefore } },
        ],
        processingAttempts: { lt: 3 },
      },
      data: {
        processingStatus: ProcessingStatus.PROCESSING,
        startedAt: new Date(),
        nextAttemptAt: null,
        processingAttempts: { increment: 1 },
      },
    });
    if (claim.count !== 1) {
      return { ok: false as const, skipped: true as const, reason: "Submission was already claimed or is not processable." };
    }
  }
  const attempt = alreadyClaimed ? submission.processingAttempts : submission.processingAttempts + 1;

  try {
    const metadata: Record<string, unknown> =
      submission.metadata && typeof submission.metadata === "object" && !Array.isArray(submission.metadata)
        ? (submission.metadata as Record<string, unknown>)
        : {};

    const materializedVideo = await materializeStoredVideo({
      storageProvider: submission.storageProvider,
      storageKey: submission.storageKey,
    });
    cleanupMaterializedVideo = materializedVideo.cleanup;
    if (!submission.videoHash && submission.storageProvider === "s3") {
      throw new Error("Cloud video is missing its required integrity hash.");
    }
    if (
      submission.videoHash
      && !await verifyMaterializedVideoHash(materializedVideo.path, submission.videoHash)
    ) {
      throw new Error("Materialized video failed SHA-256 integrity verification.");
    }
    const sport = submission.drillDefinition.sport;
    if (sport !== "soccer" && sport !== "basketball" && sport !== "baseball") {
      throw new Error(`Unsupported analysis sport: ${sport}`);
    }
    const verifiedOutcomes = verifiedOutcomeEvidence(metadata);
    const visionAnalysis = await runVisionAnalysis({
      videoPath: materializedVideo.path,
      sport,
      drill: submission.drillDefinition.slug,
      calibrationDistanceMeters: verifiedCalibrationDistance(metadata),
      verifiedOutcomes,
      expectedRepetitions: verifiedOutcomes?.attempts,
      homography: verifiedPlanarCalibration(metadata, submission.drillDefinition.slug),
      cameraCalibration: verifiedCameraCalibration(metadata),
    });
    const captureAssessment = assessCaptureAdherence(submission.drillDefinition.slug, visionAnalysis.evidence);
    const metrics = mapVisionAnalysisToMetrics(visionAnalysis);

    const modelVersion = resolveAnalyzerModelVersion(
      await activeModelVersion(),
      process.env.VISION_MODEL_VERSION,
      process.env.NODE_ENV === "production",
    );

    const persistedMetrics = await prisma.metricResult.upsert({
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
    const primaryMetricName = submission.drillDefinition.metricPrimaryKey;
    const primaryMetricValue = persistedMetrics[primaryMetricName as keyof typeof persistedMetrics];
    const protocol = DRILL_PROTOCOLS[submission.drillDefinition.slug as keyof typeof DRILL_PROTOCOLS];
    const metricReleased = await isPrimaryMetricReleased({
      drillDefinitionId: submission.drillDefinitionId,
      drillSlug: submission.drillDefinition.slug,
      metricName: primaryMetricName,
      modelVersion,
    });
    const performanceAssessment = buildPerformanceAssessment({
      captureVerified: captureAssessment.status === "VERIFIED",
      metricReleased,
      finiteMetricValue: typeof primaryMetricValue === "number" && Number.isFinite(primaryMetricValue),
      metricName: primaryMetricName,
      metricVersion: persistedMetrics.metricVersion,
      protocolVersion: protocol?.version ?? "unavailable",
      verifiedAt: new Date().toISOString(),
    });

    const analysisSummary = buildAnalysisSummary(
      {
        drillType: submission.drillDefinition.slug,
        metadata: {
          ...metadata,
          sport: submission.drillDefinition.sport,
          visionAnalysis,
        },
      },
      persistedMetrics,
    );

    await prisma.drillSubmission.update({
      where: { id: submissionId },
      data: {
        processingStatus: ProcessingStatus.COMPLETED,
        completedAt: new Date(),
        uploadProgress: 100,
        lastError: null,
        nextAttemptAt: null,
        deadLetteredAt: null,
        metadata: {
          ...metadata,
          sport: submission.drillDefinition.sport,
          captureAssessment,
          performanceAssessment,
          analysisSummary,
          visionAnalysis,
          analysisEngine: "athlemetry-vision-core",
          analyzedAt: new Date().toISOString(),
        },
      },
    });

    await prisma.processingLog.create({
      data: {
        submissionId,
        status: ProcessingStatus.COMPLETED,
        message: "Metrics extracted successfully.",
        attempt,
        durationMs: Date.now() - start,
      },
    });

    await recalculateBenchmarksForSubmission(submissionId);

    await upsertCoachingPlanForSubmission({
      submissionId,
      athleteId: submission.athleteId,
      drillDefinitionId: submission.drillDefinitionId,
      drillSlug: submission.drillDefinition.slug,
      primaryMetricName: submission.drillDefinition.metricPrimaryKey,
      primaryMetricValue,
      metricVersion: persistedMetrics.metricVersion,
      metadata: { ...metadata, captureAssessment, performanceAssessment, visionAnalysis },
    });

    await maybePurgeAfterCompletion({
      submissionId,
      storageProvider: submission.storageProvider,
      storageKey: submission.storageKey,
      reviewRetentionDays: typeof metadata.reviewRetentionDays === "number" ? metadata.reviewRetentionDays : 0,
    });

    return { ok: true as const };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown processing error.";

    const retryDecision = processingRetryDecision(attempt);

    const failed = await prisma.drillSubmission.update({
      where: { id: submissionId },
      data: {
        processingStatus: retryDecision.terminal ? "FAILED" : "RETRYING",
        lastError: err,
        startedAt: null,
        nextAttemptAt: retryDecision.nextAttemptAt,
        deadLetteredAt: retryDecision.terminal ? retryDecision.deadLetteredAt : null,
      },
      select: {
        id: true,
        processingAttempts: true,
      },
    });

    await prisma.processingLog.create({
      data: {
        submissionId,
        status: retryDecision.terminal ? "FAILED" : "RETRYING",
        message: err,
        attempt: failed.processingAttempts,
        durationMs: Date.now() - start,
      },
    });

    if (retryDecision.terminal) {
      await maybePurgeAfterTerminalFailure({
        submissionId,
        storageProvider: submission.storageProvider,
        storageKey: submission.storageKey,
      });
    }

    return { ok: false as const, reason: err };
  } finally {
    if (cleanupMaterializedVideo) {
      try {
        await cleanupMaterializedVideo();
      } catch (cleanupError) {
        await prisma.systemLog.create({
          data: {
            level: "WARN",
            category: "video-materialization-cleanup",
            message: cleanupError instanceof Error ? cleanupError.message : "Temporary video cleanup failed.",
            metadata: { submissionId },
          },
        });
      }
    }
  }
}

export async function processSubmission(submissionId: string) {
  return processSubmissionInternal(submissionId, false);
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
  const claimedIds = await claimReadySubmissionIds(limit);

  const results = [];
  for (const submissionId of claimedIds) {
    // Sequential processing is intentional to keep memory bounded in free-tier environments.
    const result = await processSubmissionInternal(submissionId, true);
    results.push({ submissionId, ...result });
  }

  const completed = results.filter((item) => item.ok).length;
  const skipped = results.filter((item) => "skipped" in item && item.skipped).length;
  const failed = results.length - completed - skipped;

  const purgeSummary = await purgeExpiredVideos(100);
  const coachingPlansCreated = await backfillCoachingPlans(100);
  const engagement = await scheduleEngagementNotifications(100);

  await prisma.systemLog.create({
    data: {
      level: failed > 0 ? "WARN" : "INFO",
      category: "processing-batch",
      message: `Processed ${results.length} queued submissions.`,
      metadata: {
        completed,
        failed,
        skipped,
        purgedExpiredVideos: purgeSummary.purged,
        coachingPlansCreated,
        engagement,
      },
    },
  });

  return {
    total: results.length,
    completed,
    failed,
    skipped,
    purgedExpiredVideos: purgeSummary.purged,
    coachingPlansCreated,
    engagement,
    results,
  };
}
