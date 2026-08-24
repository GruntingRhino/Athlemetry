import { Prisma } from "@prisma/client";

import { buildCohortKey, recalculateBenchmarksForSubmission } from "@/lib/benchmarking";

export type BenchmarkRebuildTarget = {
  cohortKey: string;
  drillDefinitionId: string;
  metricName: string;
};

type BenchmarkTargetQueryClient = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
};

export async function findBenchmarkRebuildTargets(
  client: BenchmarkTargetQueryClient,
  drillDefinitionId?: string,
) {
  return client.$queryRaw<BenchmarkRebuildTarget[]>(Prisma.sql`
    SELECT DISTINCT
      s."drillType"::text || '|' ||
      CASE
        WHEN u.age IS NULL THEN 'UNSPECIFIED'
        ELSE ((u.age / 2) * 2)::text || '-' || (((u.age / 2) * 2) + 1)::text
      END || '|' ||
      COALESCE(u.position, 'UNSPECIFIED') || '|' ||
      COALESCE(u."competitionLevel", 'UNSPECIFIED') || '|' ||
      COALESCE(u.gender, 'UNSPECIFIED') AS "cohortKey",
      s."drillDefinitionId" AS "drillDefinitionId",
      d."metricPrimaryKey" AS "metricName"
    FROM "DrillSubmission" s
    INNER JOIN "User" u ON u.id = s."athleteId"
    INNER JOIN "MetricResult" m ON m."submissionId" = s.id
    INNER JOIN "DrillDefinition" d ON d.id = s."drillDefinitionId"
    WHERE s."processingStatus" = 'COMPLETED'
      AND u."deletedAt" IS NULL
      AND u."shareInBenchmarks" = true
      ${drillDefinitionId ? Prisma.sql`AND s."drillDefinitionId" = ${drillDefinitionId}` : Prisma.empty}
  `);
}

type BenchmarkRebuildClient = {
  benchmarkRebuildJob: {
    upsert(input: {
      where: { cohortKey_drillDefinitionId_metricName: BenchmarkRebuildTarget };
      create: BenchmarkRebuildTarget;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
};

export async function enqueueBenchmarkRebuilds(
  client: BenchmarkRebuildClient,
  targets: BenchmarkRebuildTarget[],
) {
  const unique = new Map(
    targets.map((target) => [
      `${target.cohortKey}\u0000${target.drillDefinitionId}\u0000${target.metricName}`,
      target,
    ]),
  );
  const queuedAt = new Date();
  for (const target of unique.values()) {
    await client.benchmarkRebuildJob.upsert({
      where: { cohortKey_drillDefinitionId_metricName: target },
      create: target,
      update: {
        status: "PENDING",
        attempts: 0,
        cursorSubmissionId: null,
        lastError: null,
        queuedAt,
        claimedAt: null,
        completedAt: null,
      },
    });
  }
}

type RebuildJob = BenchmarkRebuildTarget & {
  id: string;
  attempts: number;
  cursorSubmissionId: string | null;
};

type RebuildSubmission = {
  id: string;
  drillType: string;
  athlete: {
    age: number | null;
    position: string | null;
    competitionLevel: string | null;
    gender: string | null;
  };
};

type BenchmarkRebuildProcessorClient = {
  benchmarkRebuildJob: {
    findFirst(input: unknown): Promise<RebuildJob | null>;
    updateMany(input: unknown): Promise<{ count: number }>;
    update(input: unknown): Promise<unknown>;
  };
  drillSubmission: {
    findMany(input: unknown): Promise<RebuildSubmission[]>;
  };
};

const REBUILD_SUBMISSION_BATCH_SIZE = 100;
const MAX_REBUILD_ATTEMPTS = 3;

export async function processBenchmarkRebuildJobs(
  rawClient: unknown,
  recalculate: (submissionId: string) => Promise<unknown> = recalculateBenchmarksForSubmission,
  limit = 2,
) {
  const client = rawClient as BenchmarkRebuildProcessorClient;
  await client.benchmarkRebuildJob.updateMany({
    where: {
      status: "PROCESSING",
      claimedAt: { lt: new Date(Date.now() - 15 * 60_000) },
    },
    data: { status: "PENDING", claimedAt: null },
  });
  const result = { claimed: 0, completed: 0, checkpointed: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    const job = await client.benchmarkRebuildJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { queuedAt: "asc" },
    });
    if (!job) break;

    const claimed = await client.benchmarkRebuildJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", claimedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    result.claimed += 1;

    try {
      const submissions = await client.drillSubmission.findMany({
        where: {
          drillDefinitionId: job.drillDefinitionId,
          processingStatus: "COMPLETED",
          metricResult: { isNot: null },
          ...(job.cursorSubmissionId ? { id: { gt: job.cursorSubmissionId } } : {}),
        },
        select: {
          id: true,
          drillType: true,
          athlete: { select: { age: true, position: true, competitionLevel: true, gender: true } },
        },
        orderBy: { id: "asc" },
        take: REBUILD_SUBMISSION_BATCH_SIZE,
      });
      const matchingSubmission = submissions.find(
        (submission) => buildCohortKey(submission as never) === job.cohortKey,
      );
      if (matchingSubmission) await recalculate(matchingSubmission.id);

      if (!matchingSubmission && submissions.length === REBUILD_SUBMISSION_BATCH_SIZE) {
        await client.benchmarkRebuildJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            cursorSubmissionId: submissions.at(-1)?.id ?? job.cursorSubmissionId,
            claimedAt: null,
            lastError: null,
            queuedAt: new Date(),
          },
        });
        result.checkpointed += 1;
      } else {
        await client.benchmarkRebuildJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: new Date(), claimedAt: null, lastError: null },
        });
        result.completed += 1;
      }
    } catch (error) {
      const terminalFailure = job.attempts + 1 >= MAX_REBUILD_ATTEMPTS;
      await client.benchmarkRebuildJob.update({
        where: { id: job.id },
        data: {
          status: terminalFailure ? "FAILED" : "PENDING",
          claimedAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown rebuild failure",
          queuedAt: new Date(),
        },
      });
      result.failed += 1;
    }
  }
  return result;
}
