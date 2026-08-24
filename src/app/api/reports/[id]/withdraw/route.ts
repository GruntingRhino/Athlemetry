import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const report = await prisma.userReport.findFirst({
    where: { id, reporterId: session.user.id },
    select: { id: true, status: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (report.status !== "OPEN") {
    return NextResponse.json({ error: "Only open reports can be withdrawn." }, { status: 409 });
  }

  try {
    const withdrawn = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.userReport.updateMany({
        where: { id, reporterId: session.user.id, status: "OPEN" },
        data: { status: "DISMISSED", reviewedAt: new Date(), reviewedById: null },
      });
      if (updated.count !== 1) return false;

      await transaction.userReportStatusEvent.create({
        data: {
          reportId: id,
          actorUserId: session.user.id,
          status: "DISMISSED",
          resolutionNote: "Withdrawn by reporter.",
        },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Submission report withdrawn",
          metadata: {
            action: "SUBMISSION_REPORT_WITHDRAWN",
            actorUserId: session.user.id,
            reportId: id,
          },
        },
      });
      return true;
    });

    if (!withdrawn) {
      return NextResponse.json({ error: "Only open reports can be withdrawn." }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Report could not be withdrawn safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
