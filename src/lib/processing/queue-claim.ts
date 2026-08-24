import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function claimReadySubmissionIds(limit = 10, now = new Date()) {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 10));
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT submission."id"
      FROM "DrillSubmission" AS submission
      LEFT JOIN "BillingAccount" AS account ON account."userId" = submission."athleteId"
      LEFT JOIN "BillingSubscription" AS subscription ON subscription."billingAccountId" = account."id"
      WHERE submission."processingAttempts" < 3
        AND (
          submission."processingStatus" = 'QUEUED'::"ProcessingStatus"
          OR (
            submission."processingStatus" = 'RETRYING'::"ProcessingStatus"
            AND submission."nextAttemptAt" <= ${now}
          )
          OR (
            submission."processingStatus" = 'PROCESSING'::"ProcessingStatus"
            AND submission."startedAt" <= ${staleBefore}
          )
        )
      ORDER BY
        CASE
          WHEN subscription."status" IN ('active', 'trialing')
            AND subscription."currentPeriodEnd" > ${now} THEN 0
          WHEN subscription."status" = 'past_due'
            AND COALESCE(subscription."graceUntil", subscription."currentPeriodEnd") > ${now} THEN 0
          ELSE 1
        END ASC,
        submission."queuedAt" ASC
      FOR UPDATE OF submission SKIP LOCKED
      LIMIT ${boundedLimit}
    )
    UPDATE "DrillSubmission" AS submission
    SET
      "processingStatus" = 'PROCESSING'::"ProcessingStatus",
      "startedAt" = ${now},
      "nextAttemptAt" = NULL,
      "processingAttempts" = submission."processingAttempts" + 1
    FROM candidates
    WHERE submission."id" = candidates."id"
    RETURNING submission."id"
  `);
  return claimed.map((submission) => submission.id);
}
