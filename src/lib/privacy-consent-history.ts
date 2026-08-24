import { prisma } from "@/lib/prisma";

export async function readPrivacyConsentHistoryForOwner(userId: string) {
  return prisma.$transaction(async (transaction) => {
    const [consentLogs, modelTrainingConsent] = await Promise.all([
      transaction.consentLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      transaction.consentLog.findFirst({
        where: { userId, consentType: "MODEL_TRAINING" },
        orderBy: { createdAt: "desc" },
        select: { granted: true },
      }),
    ]);

    await transaction.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Privacy consent history viewed",
        metadata: { action: "PRIVACY_CONSENT_HISTORY_VIEWED", actorUserId: userId },
      },
    });

    return { consentLogs, modelTrainingConsent };
  });
}
