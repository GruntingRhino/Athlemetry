import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportStatusUpdateSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = reportStatusUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid report status and any required resolution note are required." }, { status: 400 });
  }

  let report;
  try {
    report = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.userReport.update({
        where: { id },
        data: {
          status: parsed.data.status,
          reviewedAt: new Date(),
          reviewedById: session.user.id,
        },
      });
      await transaction.userReportStatusEvent.create({
        data: {
          reportId: id,
          actorUserId: session.user.id,
          status: parsed.data.status,
          resolutionNote: parsed.data.resolutionNote,
        },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Submission report review status updated",
          metadata: {
            action: "SUBMISSION_REPORT_STATUS_UPDATED",
            actorUserId: session.user.id,
            reportId: id,
            status: parsed.data.status,
          },
        },
      });
      return updated;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Report status could not be updated safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, report });
}
