import { type DrillSubmission, type MetricResult } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function computePercentile(sortedValues: number[], value: number, lowerIsBetter: boolean) {
  if (sortedValues.length <= 1) {
    return 50;
  }

  if (lowerIsBetter) {
    const rank = sortedValues.findIndex((candidate) => candidate >= value);
    const effectiveRank = rank === -1 ? sortedValues.length - 1 : rank;
    return ((sortedValues.length - effectiveRank - 1) / (sortedValues.length - 1)) * 100;
  }

  const rank = sortedValues.findIndex((candidate) => candidate <= value);
  const effectiveRank = rank === -1 ? sortedValues.length - 1 : rank;
  return ((sortedValues.length - effectiveRank - 1) / (sortedValues.length - 1)) * 100;
}

export function computeStdDev(values: number[], mean: number) {
  if (values.length <= 1) {
    return 0;
  }

  const variance =
    values.reduce((sum, current) => sum + (current - mean) * (current - mean), 0) / values.length;
  return Math.sqrt(variance);
}

export function computeQuantile(values: number[], q: number) {
  if (!values.length) {
    return 0;
  }

  const index = (values.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) {
    return values[low];
  }

  return values[low] + (values[high] - values[low]) * (index - low);
}

function valueFromMetric(metric: MetricResult, metricKey: string): number {
  const raw = metric[metricKey as keyof typeof metric];
  if (typeof raw !== "number") {
    return 0;
  }

  return raw;
}

export function buildCohortKey(
  submission: DrillSubmission & {
    athlete: {
      age: number | null;
      position: string | null;
      competitionLevel: string | null;
      gender: string | null;
    };
  },
) {
  const ageBandBase = Math.floor((submission.athlete.age ?? 0) / 2) * 2;
  const ageBand = `${ageBandBase}-${ageBandBase + 1}`;
  const position = submission.athlete.position ?? "UNSPECIFIED";
  const level = submission.athlete.competitionLevel ?? "UNSPECIFIED";
  const gender = submission.athlete.gender ?? "UNSPECIFIED";

  return `${submission.drillType}|${ageBand}|${position}|${level}|${gender}`;
}

export async function recalculateBenchmarksForSubmission(submissionId: string) {
  const submission = await prisma.drillSubmission.findUnique({
    where: { id: submissionId },
    include: {
      athlete: {
        select: {
          id: true,
          age: true,
          position: true,
          competitionLevel: true,
          gender: true,
          anonymizeForBenchmark: true,
        },
      },
      drillDefinition: true,
      metricResult: true,
    },
  });

  if (!submission?.metricResult) {
    return;
  }

  const metricKey = submission.drillDefinition.metricPrimaryKey;
  const ownValue = valueFromMetric(submission.metricResult, metricKey);

  const key = buildCohortKey(submission);

  const cohort = await prisma.drillSubmission.findMany({
    where: {
      drillType: submission.drillType,
      processingStatus: "COMPLETED",
      athlete: {
        deletedAt: null,
        age: submission.athlete.age,
        position: submission.athlete.position,
        competitionLevel: submission.athlete.competitionLevel,
        gender: submission.athlete.gender,
      },
    },
    include: {
      metricResult: true,
    },
  });

  const values = cohort
    .map((candidate) => {
      if (!candidate.metricResult) {
        return 0;
      }
      return valueFromMetric(candidate.metricResult, metricKey);
    })
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return;
  }

  const lowerIsBetter = submission.drillDefinition.lowerIsBetter;
  const sorted = [...values].sort((a, b) => (lowerIsBetter ? a - b : b - a));
  const pct = computePercentile(sorted, ownValue, lowerIsBetter);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = computeStdDev(values, mean);
  const normalizedScore = sd === 0 ? 0 : (ownValue - mean) / sd;

  const relativeRank = lowerIsBetter
    ? sorted.findIndex((value) => value >= ownValue) + 1
    : sorted.findIndex((value) => value <= ownValue) + 1;

  const distribution = {
    min: Math.min(...values),
    max: Math.max(...values),
    mean,
    stdDev: sd,
    p25: computeQuantile(sorted, 0.25),
    p50: computeQuantile(sorted, 0.5),
    p75: computeQuantile(sorted, 0.75),
    p90: computeQuantile(sorted, 0.9),
  };

  await prisma.benchmarkSnapshot.upsert({
    where: { submissionId: submission.id },
    update: {
      cohortKey: key,
      percentile: pct,
      relativeRank: relativeRank <= 0 ? 1 : relativeRank,
      normalizedScore,
      distribution,
      isAnonymized: submission.athlete.anonymizeForBenchmark,
    },
    create: {
      athleteId: submission.athlete.id,
      submissionId: submission.id,
      cohortKey: key,
      percentile: pct,
      relativeRank: relativeRank <= 0 ? 1 : relativeRank,
      normalizedScore,
      distribution,
      isAnonymized: submission.athlete.anonymizeForBenchmark,
    },
  });

  await prisma.benchmarkAggregate.upsert({
    where: {
      cohortKey_drillDefinitionId_metricName: {
        cohortKey: key,
        drillDefinitionId: submission.drillDefinitionId,
        metricName: metricKey,
      },
    },
    update: {
      sampleSize: values.length,
      mean,
      stdDev: sd,
      p50: computeQuantile(sorted, 0.5),
      p90: computeQuantile(sorted, 0.9),
      lastRecalculated: new Date(),
    },
    create: {
      cohortKey: key,
      drillDefinitionId: submission.drillDefinitionId,
      metricName: metricKey,
      sampleSize: values.length,
      mean,
      stdDev: sd,
      p50: computeQuantile(sorted, 0.5),
      p90: computeQuantile(sorted, 0.9),
    },
  });
}
