import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { writeSystemLog } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { runProcessingBatch } from "@/lib/processing/queue";
import { storeVideo } from "@/lib/storage";
import { submissionMetadataSchema, validateVideoFile } from "@/lib/validators";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const where = session.user.role === "ADMIN" ? {} : { athleteId: session.user.id };

  const submissions = await prisma.drillSubmission.findMany({
    where,
    include: {
      drillDefinition: true,
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  return NextResponse.json({ submissions });
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

  try {
    const uploaded = await storeVideo(file);

    const submission = await prisma.drillSubmission.create({
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
          videoRetentionHours: Number.parseInt(process.env.VIDEO_RETENTION_HOURS ?? "24", 10),
        },
      },
    });

    await prisma.processingLog.create({
      data: {
        submissionId: submission.id,
        status: "QUEUED",
        message: "Queued for processing.",
        attempt: 0,
      },
    });

    await writeSystemLog({
      level: "INFO",
      category: "upload",
      message: `Submission queued: ${submission.id}`,
      latencyMs: Date.now() - started,
      metadata: {
        drillSlug: drill.slug,
      },
    });

    // Fast-path for low volume free-tier usage.
    await runProcessingBatch(1);

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
