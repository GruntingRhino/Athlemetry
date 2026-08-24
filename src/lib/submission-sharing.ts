import { prisma } from "@/lib/prisma";

export async function readSharedSubmissionForRecipient(recipientId: string, submissionId: string) {
  return prisma.$transaction(async (transaction) => {
    const submission = await transaction.drillSubmission.findFirst({
      where: {
        id: submissionId,
        shares: { some: { recipientId, active: true } },
      },
      select: {
        id: true,
        drillType: true,
        recordingDate: true,
        submittedAt: true,
        processingStatus: true,
        drillDefinition: { select: { name: true, sport: true } },
        userReports: {
          select: {
            id: true,
            status: true,
            reviewedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!submission) return null;

    await transaction.submissionShareAudit.create({
      data: {
        submissionId,
        recipientId,
        actorUserId: recipientId,
        action: "VIEWED",
      },
    });
    return submission;
  });
}
