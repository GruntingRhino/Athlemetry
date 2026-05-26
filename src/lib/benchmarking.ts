import { type DrillSubmission, type MetricResult } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function sortAscending(values: number[]) {
  return [...values].sort((a, b) => a - b);
}

function getAgeBand(age: number | null | undefined) {
  if (typeof age !== "number" || !Number.isFinite(age)) {
    return { label: "UNSPECIFIED", min: null as number | null, max: null as number | null };
  }

  const ageBandBase = Math.floor(age / 2) * 2;
  return {
    label: `${ageBandBase}-${ageBandBase + 1}`,
    min: ageBandBase,
    max: ageBandBase + 1,
  };
}

export function computePercentile(sortedValues: number[], value: number, lowerIsBetter: boolean) {
  if (sortedValues.length <= 1) {
    return 50;
  }

  const values = sortAscending(sortedValues);
  const first = values.findIndex((candidate) => candidate === value);
  const last = values.length - 1 - [...values].reverse().findIndex((candidate) => candidate === value);
  const lowerBound = first === -1 ? values.findIndex((candidate) => candidate > value) : first;
  const upperBound = last === values.length ? values.findIndex((candidate) => candidate > value) - 1 : last;

  const avgIndex =
    lowerBound === -1
      ? values.length - 1
      : upperBound === -1
        ? 0
        : (lowerBound + upperBound) / 2;

  if (lowerIsBetter) {
    return ((values.length - 1 - avgIndex) / (values.length - 1)) * 100;
  }

  return (avgIndex / (values.length - 1)) * 100;
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

  const sorted = sortAscending(values);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) {
    return sorted[low];
  }

  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
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
  const ageBand = getAgeBand(submission.athlete.age).label;
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
  const ageBand = getAgeBand(submission.athlete.age);

  const cohort = await prisma.drillSubmission.findMany({
    where: {
      drillType: submission.drillType,
      processingStatus: "COMPLETED",
      athlete: {
        deletedAt: null,
        ...(ageBand.min === null || ageBand.max === null
          ? { age: null }
          : { age: { gte: ageBand.min, lte: ageBand.max } }),
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
  const normalizedScore =
    sd === 0 ? 0 : lowerIsBetter ? (mean - ownValue) / sd : (ownValue - mean) / sd;

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
