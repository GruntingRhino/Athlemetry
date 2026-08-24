import { prisma } from "@/lib/prisma";
import { containsUserContentContactDetails } from "@/lib/validators";

export async function readFeedbackHistoryForOwner(reporterId: string) {
  return prisma.$transaction(async (transaction) => {
    const reports = await transaction.userReport.findMany({
      where: { reporterId },
      select: {
        id: true,
        reason: true,
        requestType: true,
        metricName: true,
        reportedValue: true,
        disputedFrameIndex: true,
        accuracyRating: true,
        usefulnessRating: true,
        status: true,
        createdAt: true,
        statusEvents: {
          select: { status: true, resolutionNote: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    await transaction.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Feedback history viewed",
        metadata: {
          action: "FEEDBACK_HISTORY_VIEWED",
          actorUserId: reporterId,
        },
      },
    });

    return reports.map(({ statusEvents, ...report }) => ({
      ...report,
      statusEvents: statusEvents.map(({ resolutionNote, ...event }) => {
        const resolutionNoteWasWithheld = Boolean(
          resolutionNote && containsUserContentContactDetails(resolutionNote),
        );

        return {
          ...event,
          resolutionNote: resolutionNoteWasWithheld ? null : resolutionNote,
          resolutionNoteWasWithheld,
        };
      }),
    }));
  });
}
