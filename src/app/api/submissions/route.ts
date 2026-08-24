import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canUsePaidFeatures } from "@/lib/billing";
import { filterCustomerMetricResult, isMetricReleased, sanitizeCustomerMetadata } from "@/lib/customer-metrics";
import { writeSystemLog } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { runProcessingBatch } from "@/lib/processing/queue";
import { computeVideoHash, getDuplicateUploadWindowHours, purgeStoredVideo, storeVideo } from "@/lib/storage";
import { consumeMonthlySubmissionQuota, SubmissionQuotaExceededError } from "@/lib/submission-usage";
import { submissionMetadataSchema, validateVideoFile } from "@/lib/validators";

const INTERNAL_SUBMISSION_FIELDS = new Set(["storageKey", "videoHash", "fileUrl"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const requester = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { deletedAt: true },
  });
  if (!requester || requester.deletedAt) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const where = session.user.role === "ADMIN" ? {} : { athleteId: session.user.id };

  const submissions = await prisma.drillSubmission.findMany({
    where,
    include: {
      drillDefinition: { include: { metricValidations: true } },
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  if (session.user.role === "ADMIN") return NextResponse.json({ submissions });
  const customerSubmissions = submissions.map((submission) => {
    const releasedMetricNames = new Set(
      submission.drillDefinition.metricValidations
        .filter((validation) => isMetricReleased(submission.drillDefinition.slug, validation.metricName, submission.metricResult?.metricVersion ?? "unavailable", validation))
        .map((validation) => validation.metricName),
    );
    const metricResult = filterCustomerMetricResult(
      submission.metricResult as unknown as Record<string, unknown> | null,
      releasedMetricNames,
      submission.metadata,
      submission.drillDefinition.slug,
    );
    const primaryValue = metricResult?.[submission.drillDefinition.metricPrimaryKey];
    const primaryReleased = typeof primaryValue === "number" && Number.isFinite(primaryValue);
    const customerSubmission = Object.fromEntries(
      Object.entries(submission).filter(([key]) => !INTERNAL_SUBMISSION_FIELDS.has(key)),
    );
    const customerDrillDefinition = Object.fromEntries(
      Object.entries(submission.drillDefinition).filter(([key]) => key !== "metricValidations"),
    );
    return {
      ...customerSubmission,
      metadata: sanitizeCustomerMetadata(submission.metadata),
      drillDefinition: customerDrillDefinition,
      metricResult,
      benchmarkSnapshots: primaryReleased ? submission.benchmarkSnapshots : null,
    };
  });

  return NextResponse.json({ submissions: customerSubmissions });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.age && user.age < 18 && !user.parentConsentVerified) {
    return NextResponse.json(
      { error: "Parental approval is required before drill submissions for minors." },
      { status: 403 },
    );
  }

  if (!await canUsePaidFeatures(user.id, user.role)) {
    return NextResponse.json({ error: "An active Athlemetry subscription is required." }, { status: 402 });
  }

  const started = Date.now();
  const formData = await request.formData();

  const file = formData.get("video");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Video file is required." }, { status: 400 });
  }

  try {
    validateVideoFile(file);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid file." },
      { status: 400 },
    );
  }

  const parsed = submissionMetadataSchema.safeParse({
    drillDefinitionId: formData.get("drillDefinitionId"),
    recordingDate: formData.get("recordingDate"),
    location: formData.get("location"),
    drillType: formData.get("drillType"),
    frameRate: formData.get("frameRate"),
    startFrame: formData.get("startFrame"),
    finishFrame: formData.get("finishFrame"),
    repetitionHint: formData.get("repetitionHint"),
    cameraAngle: formData.get("cameraAngle"),
    athleteHandedness: formData.get("athleteHandedness"),
    clipQuality: formData.get("clipQuality"),
    measurementDistanceFeet: formData.get("measurementDistanceFeet"),
    baseballLeague: formData.get("baseballLeague"),
    notes: formData.get("notes"),
    reviewRetentionDays: formData.get("reviewRetentionDays"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const drill = await prisma.drillDefinition.findUnique({
    where: { id: parsed.data.drillDefinitionId },
  });

  if (!drill || !drill.isActive) {
    return NextResponse.json({ error: "Invalid drill." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const videoHash = computeVideoHash(buffer);
  const duplicateCutoff = new Date(Date.now() - getDuplicateUploadWindowHours() * 60 * 60 * 1000);
  const existingDuplicate = await prisma.drillSubmission.findFirst({
    where: { athleteId: session.user.id, videoHash, submittedAt: { gte: duplicateCutoff } },
    select: { id: true },
  });
  if (existingDuplicate) {
    return NextResponse.json({ error: "Duplicate upload detected. This video was already submitted within the last 24 hours.", existingSubmissionId: existingDuplicate.id }, { status: 409 });
  }

  const reviewRetentionDays = user.role === "COACH" || user.role === "ADMIN"
    ? parsed.data.reviewRetentionDays ?? 0
    : 0;

  try {
    const uploaded = await storeVideo({ fileName: file.name, buffer, contentType: file.type });

    let submission;
    try {
      submission = await prisma.$transaction(async (transaction) => {
        await consumeMonthlySubmissionQuota(transaction, {
          userId: session.user.id,
          role: user.role,
        });
        const created = await transaction.drillSubmission.create({
          data: {
            athleteId: session.user.id,
            drillDefinitionId: drill.id,
            recordingDate: new Date(parsed.data.recordingDate),
            location: parsed.data.location,
            drillType: parsed.data.drillType,
            fileUrl: null,
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            mimeType: uploaded.mimeType,
            storageProvider: uploaded.storageProvider,
            storageKey: uploaded.storageKey,
            videoHash: uploaded.videoHash,
            videoExpiresAt: uploaded.videoExpiresAt,
            videoDeletedAt: null,
            retainVideoForAudit: false,
            compressionStatus: uploaded.compressionStatus,
            uploadProgress: 100,
            processingStatus: "QUEUED",
            frameRate: parsed.data.frameRate,
            startFrame: parsed.data.startFrame,
            finishFrame: parsed.data.finishFrame,
            repetitionHint: parsed.data.repetitionHint,
            metadata: {
              uploadSource: "web",
              originalName: file.name,
              storagePolicy: "metrics-first",
              reviewRetentionDays,
              sport: drill.sport,
              cameraAngle: parsed.data.cameraAngle ?? "unknown",
              athleteHandedness: parsed.data.athleteHandedness ?? "unknown",
              clipQuality: parsed.data.clipQuality ?? "good",
              measurementDistanceFeet: parsed.data.measurementDistanceFeet ?? null,
              baseballLeague: parsed.data.baseballLeague ?? null,
              notes: parsed.data.notes ?? null,
            },
          },
        });

        await transaction.processingLog.create({
          data: {
            submissionId: created.id,
            status: "QUEUED",
            message: "Queued for processing.",
            attempt: 0,
          },
        });
        await transaction.systemLog.create({
          data: {
            level: "INFO",
            category: "SECURITY_AUDIT",
            message: "Submission created",
            metadata: {
              action: "SUBMISSION_CREATED",
              actorUserId: session.user.id,
              submissionId: created.id,
            },
          },
        });
        return created;
      });
    } catch (error) {
      await purgeStoredVideo({
        storageProvider: uploaded.storageProvider,
        storageKey: uploaded.storageKey,
      }).catch(() => undefined);
      if (error instanceof SubmissionQuotaExceededError) {
        return NextResponse.json({ error: "Monthly submission limit reached. Please try again next month." }, { status: 429 });
      }
      return NextResponse.json({ error: "Submission could not be recorded safely." }, { status: 503 });
    }

    await writeSystemLog({
      level: "INFO",
      category: "upload",
      message: `Submission queued: ${submission.id}`,
      latencyMs: Date.now() - started,
      metadata: {
        drillSlug: drill.slug,
      },
    });

    if (process.env.INLINE_PROCESSING_ENABLED === "true") {
      await runProcessingBatch(1);
    }

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch (error) {
    await writeSystemLog({
      level: "ERROR",
      category: "upload",
      message: error instanceof Error ? error.message : "Upload failed.",
      latencyMs: Date.now() - started,
    });

    return NextResponse.json({ error: "Submission failed." }, { status: 500 });
  }
}
