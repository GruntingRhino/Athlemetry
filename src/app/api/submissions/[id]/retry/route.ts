import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processSubmission } from "@/lib/processing/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const submission = await prisma.drillSubmission.findUnique({ where: { id } });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && submission.athleteId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.drillSubmission.update({
    where: { id },
    data: {
      processingStatus: "RETRYING",
      queuedAt: new Date(),
      lastError: null,
    },
  });

  const result = await processSubmission(id);

  return NextResponse.json({ ok: true, result });
}
