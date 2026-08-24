import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canUsePaidFeatures } from "@/lib/billing";
import { writeSystemLog } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import {
  getDuplicateUploadWindowHours,
  getInitialExpiryDate,
  purgeStoredVideo,
  verifyPresignedVideoUpload,
} from "@/lib/storage";
import { verifyUploadClaim } from "@/lib/upload-claims";
import { consumeMonthlySubmissionQuota, SubmissionQuotaExceededError } from "@/lib/submission-usage";
import { submissionMetadataSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { id: session.user.id, deletedAt: null } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.age && user.age < 18 && !user.parentConsentVerified) {
    return NextResponse.json({ error: "Parental approval is required." }, { status: 403 });
  }
  if (!await canUsePaidFeatures(user.id, user.role)) {
    return NextResponse.json({ error: "An active Athlemetry subscription is required." }, { status: 402 });
  }

  const body = await request.json().catch(() => ({}));
  const metadata = submissionMetadataSchema.safeParse(body.metadata);
  const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 255) : "";
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const videoHash = typeof body.videoHash === "string" ? body.videoHash.toLowerCase() : "";
  const uploadClaim = typeof body.uploadClaim === "string" ? body.uploadClaim : "";
  if (!/^\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.[a-zA-Z0-9]+$/.test(storageKey) || !fileName || fileSize <= 0 || !/^[a-f0-9]{64}$/.test(videoHash)) {
    return NextResponse.json({ error: "Invalid cloud submission payload." }, { status: 400 });
  }
  if (!verifyUploadClaim(uploadClaim, {
    userId: user.id,
    storageKey,
    contentLength: fileSize,
    contentType: mimeType,
    sha256: videoHash,
  })) {
    return NextResponse.json({ error: "Upload ownership claim is invalid or expired." }, { status: 400 });
  }
  if (!metadata.success) {
    await purgeStoredVideo({ storageProvider: "s3", storageKey });
    return NextResponse.json({ error: "Invalid cloud submission payload." }, { status: 400 });
  }

  const uploaded = await verifyPresignedVideoUpload({
    storageKey,
    contentLength: fileSize,
    contentType: mimeType,
    sha256: videoHash,
  });
  if (!uploaded) {
    await purgeStoredVideo({ storageProvider: "s3", storageKey });
    return NextResponse.json({ error: "Uploaded object could not be verified." }, { status: 400 });
  }

  const drill = await prisma.drillDefinition.findFirst({
    where: { id: metadata.data.drillDefinitionId, isActive: true },
  });
  if (!drill) {
    await purgeStoredVideo({ storageProvider: "s3", storageKey });
    return NextResponse.json({ error: "Invalid drill." }, { status: 400 });
  }

  const duplicateCutoff = new Date(Date.now() - getDuplicateUploadWindowHours() * 60 * 60 * 1000);
  const duplicate = await prisma.drillSubmission.findFirst({
    where: { athleteId: user.id, videoHash, submittedAt: { gte: duplicateCutoff } },
    select: { id: true },
  });
  if (duplicate) {
    await purgeStoredVideo({ storageProvider: "s3", storageKey });
    return NextResponse.json({ error: "Duplicate upload detected.", existingSubmissionId: duplicate.id }, { status: 409 });
  }

  const reviewRetentionDays = user.role === "COACH" || user.role === "ADMIN"
    ? metadata.data.reviewRetentionDays ?? 0
    : 0;
  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      await consumeMonthlySubmissionQuota(tx, { userId: user.id, role: user.role });
      const created = await tx.drillSubmission.create({
      data: {
        athleteId: user.id,
        drillDefinitionId: drill.id,
        recordingDate: new Date(metadata.data.recordingDate),
        location: metadata.data.location,
        drillType: drill.slug,
        fileName,
        fileSize,
        mimeType,
        storageProvider: "s3",
        storageKey,
        videoHash,
        videoExpiresAt: getInitialExpiryDate(),
        compressionStatus: fileSize > 45 * 1024 * 1024 ? "COMPRESSED" : "NOT_REQUIRED",
        uploadProgress: 100,
        processingStatus: "QUEUED",
        frameRate: metadata.data.frameRate,
        startFrame: metadata.data.startFrame,
        finishFrame: metadata.data.finishFrame,
        repetitionHint: metadata.data.repetitionHint,
        metadata: {
          uploadSource: "direct-s3",
          originalName: fileName,
          storagePolicy: "metrics-first",
          reviewRetentionDays,
          sport: drill.sport,
          cameraAngle: metadata.data.cameraAngle ?? "unknown",
          athleteHandedness: metadata.data.athleteHandedness ?? "unknown",
          clipQuality: metadata.data.clipQuality ?? "good",
          measurementDistanceFeet: metadata.data.measurementDistanceFeet ?? null,
          baseballLeague: metadata.data.baseballLeague ?? null,
          notes: metadata.data.notes ?? null,
        },
      },
    });
    await tx.processingLog.create({
      data: { submissionId: created.id, status: "QUEUED", message: "Queued for processing.", attempt: 0 },
    });
    await tx.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission created",
        metadata: {
          action: "SUBMISSION_CREATED",
          actorUserId: user.id,
          submissionId: created.id,
        },
      },
    });
      return created;
    });
  } catch (error) {
    await purgeStoredVideo({ storageProvider: "s3", storageKey }).catch(() => undefined);
    if (error instanceof SubmissionQuotaExceededError) {
      return NextResponse.json({ error: "Monthly submission limit reached. Please try again next month." }, { status: 429 });
    }
    return NextResponse.json({ error: "Submission could not be recorded safely." }, { status: 503 });
  }

  await writeSystemLog({
    level: "INFO",
    category: "cloud-upload",
    message: `Cloud submission queued: ${submission.id}`,
    metadata: { drillSlug: drill.slug },
  });
  return NextResponse.json({ ok: true, submissionId: submission.id });
}
