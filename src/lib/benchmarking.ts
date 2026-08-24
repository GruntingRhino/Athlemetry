import { type DrillSubmission, type MetricResult } from "@prisma/client";

import { isPrimaryMetricReleased } from "@/lib/customer-metrics";
import { CAPTURE_ASSESSMENT_SOURCE, isCaptureVerified } from "@/lib/capture-adherence";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import {
  buildPerformanceAssessment,
  isPerformanceAssessmentVerified,
  PERFORMANCE_ASSESSMENT_SOURCE,
} from "@/lib/performance-verification";
import { prisma } from "@/lib/prisma";

export const MINIMUM_BENCHMARK_COHORT_SIZE = 20;

export function isBenchmarkCohortSufficient(size: number) {
  return Number.isInteger(size) && size >= MINIMUM_BENCHMARK_COHORT_SIZE;
}

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

type CohortBenchmarkCandidate = {
  athleteId: string;
  submissionId: string;
  value: number;
  isAnonymized: boolean;
};

export function calculateCohortBenchmark(
  candidates: CohortBenchmarkCandidate[],
  lowerIsBetter: boolean,
) {
  if (!isBenchmarkCohortSufficient(candidates.length)) return null;
  const values = candidates.map((candidate) => candidate.value);
  const sorted = [...values].sort((a, b) => (lowerIsBetter ? a - b : b - a));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const stdDev = computeStdDev(values, mean);
  const distribution = {
    min: Math.min(...values),
    max: Math.max(...values),
    mean,
    stdDev,
    p25: computeQuantile(sorted, 0.25),
    p50: computeQuantile(sorted, 0.5),
    p75: computeQuantile(sorted, 0.75),
    p90: computeQuantile(sorted, 0.9),
  };
  return {
    snapshots: candidates.map((candidate) => {
      const relativeRank = lowerIsBetter
        ? sorted.findIndex((value) => value >= candidate.value) + 1
        : sorted.findIndex((value) => value <= candidate.value) + 1;
      return {
        athleteId: candidate.athleteId,
        submissionId: candidate.submissionId,
        percentile: computePercentile(sorted, candidate.value, lowerIsBetter),
        relativeRank: relativeRank <= 0 ? 1 : relativeRank,
        normalizedScore: stdDev === 0
          ? 0
          : lowerIsBetter
            ? (mean - candidate.value) / stdDev
            : (candidate.value - mean) / stdDev,
        distribution,
        isAnonymized: candidate.isAnonymized,
      };
    }),
    aggregate: {
      sampleSize: values.length,
      mean,
      stdDev,
      p50: distribution.p50,
      p90: distribution.p90,
    },
  };
}

function valueFromMetric(metric: MetricResult, metricKey: string): number | null {
  const raw = metric[metricKey as keyof typeof metric];
  if (typeof raw !== "number") {
    return null;
  }

  return raw;
}

export function isBenchmarkEligible(input: {
  shareInBenchmarks: boolean;
  performanceVerified: boolean;
  metricReleased: boolean;
  reliabilityScore: number | null | undefined;
  metricValue: number | null | undefined;
}) {
  return Boolean(
    input.shareInBenchmarks &&
      input.performanceVerified &&
      input.metricReleased &&
      typeof input.reliabilityScore === "number" &&
      input.reliabilityScore >= 60 &&
      typeof input.metricValue === "number" &&
      Number.isFinite(input.metricValue),
  );
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
          shareInBenchmarks: true,
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
  const ownMetadata =
    submission.metadata && typeof submission.metadata === "object" && !Array.isArray(submission.metadata)
      ? (submission.metadata as Record<string, unknown>)
      : {};
  const metricReleased = await isPrimaryMetricReleased({
    drillDefinitionId: submission.drillDefinitionId,
    drillSlug: submission.drillDefinition.slug,
    metricName: metricKey,
    modelVersion: submission.metricResult.metricVersion,
  });
  const protocol = DRILL_PROTOCOLS[
    submission.drillDefinition.slug as keyof typeof DRILL_PROTOCOLS
  ];
  const assessmentIdentity = {
    metricName: metricKey,
    metricVersion: submission.metricResult.metricVersion,
    protocolVersion: protocol?.version ?? "unavailable",
  };
  let performanceVerified = isPerformanceAssessmentVerified(
    submission.metadata,
    assessmentIdentity,
  );
  if (!performanceVerified) {
    const performanceAssessment = buildPerformanceAssessment({
      captureVerified: isCaptureVerified(submission.metadata),
      metricReleased,
      finiteMetricValue: typeof ownValue === "number" && Number.isFinite(ownValue),
      ...assessmentIdentity,
      verifiedAt: new Date().toISOString(),
    });
    performanceVerified = performanceAssessment.status === "VERIFIED";
    await prisma.drillSubmission.update({
      where: { id: submission.id },
      data: {
        metadata: {
          ...ownMetadata,
          performanceVerified: false,
          performanceAssessment,
        },
      },
    });
  }
  if (typeof ownValue !== "number" || !Number.isFinite(ownValue)) {
    return;
  }
  if (!isBenchmarkEligible({
    shareInBenchmarks: submission.athlete.shareInBenchmarks,
    performanceVerified,
    metricReleased,
    reliabilityScore: submission.metricResult.reliabilityScore,
    metricValue: ownValue,
  })) {
    return;
  }
  if (!isCaptureVerified(submission.metadata)) return;

  const key = buildCohortKey(submission);
  const ageBand = getAgeBand(submission.athlete.age);

  const cohort = await prisma.drillSubmission.findMany({
    where: {
      drillType: submission.drillType,
      processingStatus: "COMPLETED",
      AND: [
        { metadata: { path: ["performanceAssessment", "source"], equals: PERFORMANCE_ASSESSMENT_SOURCE } },
        { metadata: { path: ["performanceAssessment", "status"], equals: "VERIFIED" } },
        { metadata: { path: ["performanceAssessment", "metricName"], equals: metricKey } },
        { metadata: { path: ["performanceAssessment", "metricVersion"], equals: submission.metricResult.metricVersion } },
        { metadata: { path: ["performanceAssessment", "protocolVersion"], equals: protocol?.version ?? "unavailable" } },
        { metadata: { path: ["captureAssessment", "source"], equals: CAPTURE_ASSESSMENT_SOURCE } },
        { metadata: { path: ["captureAssessment", "status"], equals: "VERIFIED" } },
      ],
      metricResult: {
        is: {
          reliabilityScore: { gte: 60 },
          metricVersion: submission.metricResult.metricVersion,
        },
      },
      athlete: {
        deletedAt: null,
        shareInBenchmarks: true,
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
      athlete: { select: { id: true, anonymizeForBenchmark: true } },
    },
  });

  const candidates = cohort
    .map((candidate) => {
      if (!candidate.metricResult) {
        return null;
      }
      const value = valueFromMetric(candidate.metricResult, metricKey);
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return {
        athleteId: candidate.athlete.id,
        submissionId: candidate.id,
        value,
        isAnonymized: candidate.athlete.anonymizeForBenchmark,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  if (!isBenchmarkCohortSufficient(candidates.length)) {
    await prisma.$transaction([
      prisma.benchmarkSnapshot.deleteMany({ where: { cohortKey: key } }),
      prisma.benchmarkAggregate.deleteMany({
        where: {
          cohortKey: key,
          drillDefinitionId: submission.drillDefinitionId,
          metricName: metricKey,
        },
      }),
    ]);
    return;
  }

  const calculation = calculateCohortBenchmark(candidates, submission.drillDefinition.lowerIsBetter);
  if (!calculation) return;
  await prisma.$transaction(async (tx) => {
    await tx.benchmarkSnapshot.deleteMany({ where: { cohortKey: key } });
    for (let offset = 0; offset < calculation.snapshots.length; offset += 1000) {
      await tx.benchmarkSnapshot.createMany({
        data: calculation.snapshots.slice(offset, offset + 1000).map((snapshot) => ({
          ...snapshot,
          cohortKey: key,
        })),
      });
    }
    await tx.benchmarkAggregate.upsert({
      where: {
        cohortKey_drillDefinitionId_metricName: {
          cohortKey: key,
          drillDefinitionId: submission.drillDefinitionId,
          metricName: metricKey,
        },
      },
      update: { ...calculation.aggregate, lastRecalculated: new Date() },
      create: {
        cohortKey: key,
        drillDefinitionId: submission.drillDefinitionId,
        metricName: metricKey,
        ...calculation.aggregate,
      },
    });
  }, { timeout: 30_000 });
}
