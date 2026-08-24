import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submissionShareSchema } from "@/lib/validators";

async function updateShare(
  request: Request,
  action: "GRANTED" | "REVOKED",
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = submissionShareSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sharing request." }, { status: 400 });
  }

  const { id: submissionId } = await params;
  const submission = await prisma.drillSubmission.findUnique({
    where: { id: submissionId },
    select: { athleteId: true },
  });
  if (!submission || submission.athleteId !== session.user.id) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const recipient = await prisma.user.findUnique({
    where: { email: parsed.data.recipientEmail.toLowerCase() },
    select: { id: true, deletedAt: true },
  });
  const active = action === "GRANTED";
  if (!recipient || recipient.deletedAt || recipient.id === session.user.id) {
    return NextResponse.json({ ok: true, active });
  }

  try {
    await prisma.$transaction([
      prisma.submissionShare.upsert({
        where: { submissionId_recipientId: { submissionId, recipientId: recipient.id } },
        create: { submissionId, recipientId: recipient.id, active, updatedByUserId: session.user.id },
        update: { active, updatedByUserId: session.user.id },
      }),
      prisma.submissionShareAudit.create({
        data: { submissionId, recipientId: recipient.id, actorUserId: session.user.id, action },
      }),
    ]);
  } catch {
    return NextResponse.json({ error: "Sharing could not be updated safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, active });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateShare(request, "GRANTED", context);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateShare(request, "REVOKED", context);
}
