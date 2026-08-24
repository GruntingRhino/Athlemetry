import { differenceInDays } from "date-fns";
import { type MetricResult } from "@prisma/client";

import { hasReleasedMetricValue, isMetricReleased } from "@/lib/customer-metrics";
import { calculateTrialConversionRate } from "@/lib/billing-lifecycle";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { prisma } from "@/lib/prisma";
import { normalizeSport } from "@/lib/drills";

type TrendPoint = {
  date: string;
  value: number;
  percentile: number | null;
  score: number | null;
};

const SCORE_FIELDS = [
  "consistencyScore",
  "agilityScore",
  "techniqueScore",
  "accuracyScore",
  "powerScore",
] as const satisfies readonly (keyof MetricResult)[];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function normalizeScoreToHundred(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clampScore(value);
}

type ScoreFields = Partial<MetricResult>;

function collectNormalizedScores(metricResult?: ScoreFields | null) {
  if (!metricResult) {
    return [] as number[];
  }

  return SCORE_FIELDS
    .map((field) => metricResult[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(normalizeScoreToHundred);
}

export function calculateSubmissionScore(
  metricResult?: ScoreFields | null,
) {
  const normalizedScores = collectNormalizedScores(metricResult);

  if (!normalizedScores.length) {
    return null;
  }

  const average = normalizedScores.reduce((sum, value) => sum + value, 0) / normalizedScores.length;
  return Math.round(average * 10) / 10;
}

export function calculateReleasedSubmissionScore(
  metricResult: Partial<MetricResult> | null | undefined,
  releasedMetricNames: Set<string>,
) {
  if (!metricResult) return null;
  return calculateSubmissionScore(Object.fromEntries(
    SCORE_FIELDS
      .filter((field) => releasedMetricNames.has(field))
      .map((field) => [field, metricResult[field]]),
  ));
}

export function calculateAverageUserScore(
  metricResults: Array<ScoreFields | null | undefined>,
) {
  const scores = metricResults.flatMap((metricResult) => collectNormalizedScores(metricResult ?? null));

  if (!scores.length) {
    return 0;
  }

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Math.round(average * 10) / 10;
}

export function normalizeBenchmarkPercentile(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function selectComparableTrendSubmissions<
  T extends { drillDefinitionId: string; drillDefinition: { metricPrimaryKey: string } },
>(submissions: T[]) {
  const latest = submissions.at(-1);
  if (!latest) return [];
  return submissions.filter((submission) =>
    submission.drillDefinitionId === latest.drillDefinitionId
    && submission.drillDefinition.metricPrimaryKey === latest.drillDefinition.metricPrimaryKey,
  );
}

export function buildEvidenceBasedDashboardGuidance({
  values,
  scores,
  percentiles,
  recommendationsReleased,
}: {
  values: number[];
  scores: number[];
  percentiles: number[];
  recommendationsReleased: boolean;
}) {
  if (!values.length) {
    return {
      strengths: ["No released performance evidence is available yet."],
      suggestions: ["Complete a protocol-compliant, validated drill before performance guidance is generated."],
    };
  }
  if (!recommendationsReleased) {
    return {
      strengths: ["Performance interpretation is unavailable until the coaching-recommendation gate is independently validated."],
      suggestions: ["No coaching recommendation is released for this drill yet."],
    };
  }

  const strengths = [
    values.length >= 3
      ? "Sufficient released history for an initial trend view"
      : "More released sessions are required for a stable trend",
    scores.length
      ? scores.reduce((sum, value) => sum + value, 0) / scores.length >= 80
        ? "Strong released composite scores across completed sessions"
        : "Released composite scores remain below the high-performance threshold"
      : "Composite scoring is unavailable for the released metrics",
  ];

  const suggestions = [
    "Continue using the same validated capture and execution protocol so future results remain comparable.",
    percentiles.length
      ? percentiles[percentiles.length - 1] < 60
        ? "Review the released result against its verified comparable cohort."
        : "The latest verified cohort result is at or above the 60th percentile."
      : "Peer-percentile guidance is unavailable until a comparable verified cohort is available.",
  ];

  return { strengths, suggestions };
}

export function calculateMetricVariability(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function toTimelineDelta(points: TrendPoint[]) {
  if (points.length < 2) {
    return 0;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const days = Math.max(1, differenceInDays(new Date(last.date), new Date(first.date)));
  return (last.value - first.value) / days;
}

export async function getAthleteDashboardData(userId: string, sport?: string | null) {
  const normalizedSport = sport ? normalizeSport(sport) : null;
  const submissions = await prisma.drillSubmission.findMany({
    where: {
      athleteId: userId,
      processingStatus: "COMPLETED",
      ...(normalizedSport ? { drillDefinition: { sport: normalizedSport } } : {}),
    },
    include: {
      drillDefinition: true,
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: {
      submittedAt: "asc",
    },
  });

  const validations = await prisma.metricValidation.findMany({
    where: {
      drillDefinitionId: { in: [...new Set(submissions.map((item) => item.drillDefinitionId))] },
    },
  });
  const releasedByDrill = new Map<string, Set<string>>();
  for (const validation of validations) {
    const submission = submissions.find((item) => item.drillDefinitionId === validation.drillDefinitionId);
    if (!submission || !isMetricReleased(submission.drillDefinition.slug, validation.metricName, validation.modelVersion, validation)) continue;
    const releaseKey = `${validation.drillDefinitionId}:${validation.modelVersion}`;
    const released = releasedByDrill.get(releaseKey) ?? new Set<string>();
    released.add(validation.metricName);
    releasedByDrill.set(releaseKey, released);
  }

  const evidenceSubmissions = submissions.filter((item) => {
    const primaryMetricName = item.drillDefinition.metricPrimaryKey;
    const protocol = DRILL_PROTOCOLS[item.drillDefinition.slug as keyof typeof DRILL_PROTOCOLS];
    return hasReleasedMetricValue(
      item.metricResult ? { ...item.metricResult } : null,
      releasedByDrill.get(`${item.drillDefinitionId}:${item.metricResult?.metricVersion ?? "unavailable"}`) ?? new Set<string>(),
      primaryMetricName,
      item.metadata,
      protocol?.version ?? "unavailable",
    );
  });

  const drillFrequency = evidenceSubmissions.reduce<Record<string, number>>((acc, item) => {
    acc[item.drillType] = (acc[item.drillType] ?? 0) + 1;
    return acc;
  }, {});

  const trendSubmissions = selectComparableTrendSubmissions(evidenceSubmissions);
  const trendDefinition = trendSubmissions.at(-1)?.drillDefinition;
  const timeline: TrendPoint[] = trendSubmissions
    .map((item) => ({
      date: item.submittedAt.toISOString().slice(0, 10),
      value: item.metricResult?.[item.drillDefinition.metricPrimaryKey as keyof MetricResult] as number,
      percentile: normalizeBenchmarkPercentile(item.benchmarkSnapshots?.percentile),
      score: calculateReleasedSubmissionScore(
        item.metricResult,
        releasedByDrill.get(`${item.drillDefinitionId}:${item.metricResult?.metricVersion ?? "unavailable"}`) ?? new Set<string>(),
      ),
    }));

  const values = timeline.map((point) => point.value);
  const metricVariability = calculateMetricVariability(values);
  const scores = timeline
    .map((point) => point.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const averageScore = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : null;
  const percentiles = timeline
    .map((point) => point.percentile)
    .filter((percentile): percentile is number => typeof percentile === "number" && Number.isFinite(percentile));
  const { strengths, suggestions } = buildEvidenceBasedDashboardGuidance({
    values,
    scores,
    percentiles,
    recommendationsReleased: Boolean(
      trendSubmissions.length
      && releasedByDrill.get(`${trendSubmissions[0].drillDefinitionId}:${trendSubmissions[0].metricResult?.metricVersion ?? "unavailable"}`)?.has("coachingRecommendations"),
    ),
  });

  return {
    submissions,
    releasedSubmissionCount: evidenceSubmissions.length,
    researchOnlyCount: submissions.length - evidenceSubmissions.length,
    trendDrillName: trendDefinition?.name ?? null,
    trendMetricName: trendDefinition?.metricPrimaryKey ?? null,
    timeline,
    trendSlope: toTimelineDelta(timeline),
    metricVariability,
    averageScore,
    drillFrequency,
    strengths,
    suggestions,
  };
}

export async function getAdminDashboardData() {
  const lifecycleWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const [
    totalUsers,
    totalSubmissions,
    queuedSubmissions,
    failedSubmissions,
    processingLogs,
    systemErrors,
    adoption,
    growth,
    trialStartedCount,
    convertedCount,
    cancellationCount,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.drillSubmission.count(),
    prisma.drillSubmission.count({ where: { processingStatus: "QUEUED" } }),
    prisma.drillSubmission.count({ where: { processingStatus: "FAILED" } }),
    prisma.processingLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.systemLog.findMany({ where: { level: "ERROR" }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.drillSubmission.groupBy({
      by: ["drillType"],
      _count: {
        drillType: true,
      },
      orderBy: {
        _count: {
          drillType: "desc",
        },
      },
    }),
    prisma.$queryRaw<Array<{ month: string; total: number }>>`
      SELECT to_char(date_trunc('month', "submittedAt"), 'YYYY-MM') AS month,
             COUNT(*)::int AS total
      FROM "DrillSubmission"
      GROUP BY month
      ORDER BY month ASC
    `,
    prisma.billingSubscription.count({ where: { trialStartedAt: { not: null } } }),
    prisma.billingSubscription.count({ where: { firstPaidAt: { not: null } } }),
    prisma.billingSubscriptionEvent.count({
      where: { type: "customer.subscription.deleted", occurredAt: { gte: lifecycleWindowStart } },
    }),
  ]);

  return {
    totalUsers,
    totalSubmissions,
    queuedSubmissions,
    failedSubmissions,
    processingLogs,
    systemErrors,
    adoption,
    growth,
    billingLifecycle: {
      trialStartedCount,
      convertedCount,
      trialConversionRate: calculateTrialConversionRate({ trialStartedCount, convertedCount }),
      cancellationCount,
    },
  };
}
