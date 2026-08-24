import { getReleasedMetricNames } from "@/lib/customer-metrics";
import { isCaptureVerified } from "@/lib/capture-adherence";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { isPerformanceAssessmentVerified } from "@/lib/performance-verification";
import { prisma } from "@/lib/prisma";

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

export function extractCoachingContent(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const vision = (metadata as Record<string, unknown>).visionAnalysis;
  if (!vision || typeof vision !== "object" || Array.isArray(vision)) return null;
  const analysis = (vision as Record<string, unknown>).analysis;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return null;
  const record = analysis as Record<string, unknown>;
  const weaknesses = stringList(record.weaknesses);
  const recommendations = stringList(record.recommendations);
  const reliability = record.reliability && typeof record.reliability === "object"
    ? (record.reliability as Record<string, unknown>).score
    : 0;
  if (weaknesses.length === 0 || recommendations.length === 0 || typeof reliability !== "number" || !Number.isFinite(reliability)) return null;
  return {
    weaknesses,
    recommendations,
    confidenceScore: Math.max(0, Math.min(100, reliability * 100)),
  };
}

export function isCoachingMetricEligible(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function isCoachingPlanEvidenceReleased(input: {
  captureVerified: boolean;
  primaryMetricValue: unknown;
  primaryMetricReleased: boolean;
  recommendationsReleased: boolean;
  performanceAssessmentVerified: boolean;
}) {
  return input.captureVerified &&
    isCoachingMetricEligible(input.primaryMetricValue) &&
    input.primaryMetricReleased &&
    input.recommendationsReleased &&
    input.performanceAssessmentVerified;
}

export function isCoachingActionIndexValid(recommendations: unknown, actionIndex: number) {
  return Number.isInteger(actionIndex) && actionIndex >= 0 && actionIndex < stringList(recommendations).length;
}

export function getCoachingPlanReassessmentDueAt(createdAt: Date) {
  const dueAt = new Date(createdAt);
  dueAt.setUTCDate(dueAt.getUTCDate() + 28);
  return dueAt;
}

export async function isCoachingPlanEvidenceCurrent(params: {
  drillDefinitionId: string;
  drillSlug: string;
  primaryMetricName: string;
  primaryMetricValue: unknown;
  metricVersion: string;
  metadata: unknown;
}) {
  const releasedMetricNames = await getReleasedMetricNames(params.drillDefinitionId, params.drillSlug, params.metricVersion);
  const protocol = DRILL_PROTOCOLS[params.drillSlug as keyof typeof DRILL_PROTOCOLS];
  return isCoachingPlanEvidenceReleased({
    captureVerified: isCaptureVerified(params.metadata),
    primaryMetricValue: params.primaryMetricValue,
    primaryMetricReleased: releasedMetricNames.has(params.primaryMetricName),
    recommendationsReleased: releasedMetricNames.has("coachingRecommendations"),
    performanceAssessmentVerified: isPerformanceAssessmentVerified(params.metadata, {
      metricName: params.primaryMetricName,
      metricVersion: params.metricVersion,
      protocolVersion: protocol?.version ?? "unavailable",
    }),
  });
}

export async function upsertCoachingPlanForSubmission(params: {
  submissionId: string;
  athleteId: string;
  drillDefinitionId: string;
  drillSlug: string;
  primaryMetricName: string;
  primaryMetricValue: unknown;
  metricVersion: string;
  metadata: unknown;
}) {
  if (!isCaptureVerified(params.metadata)) return null;
  const releasedMetricNames = await getReleasedMetricNames(params.drillDefinitionId, params.drillSlug, params.metricVersion);
  const protocol = DRILL_PROTOCOLS[params.drillSlug as keyof typeof DRILL_PROTOCOLS];
  const performanceAssessmentVerified = isPerformanceAssessmentVerified(params.metadata, {
    metricName: params.primaryMetricName,
    metricVersion: params.metricVersion,
    protocolVersion: protocol?.version ?? "unavailable",
  });
  if (!isCoachingPlanEvidenceReleased({
    captureVerified: true,
    primaryMetricValue: params.primaryMetricValue,
    primaryMetricReleased: releasedMetricNames.has(params.primaryMetricName),
    recommendationsReleased: releasedMetricNames.has("coachingRecommendations"),
    performanceAssessmentVerified,
  })) return null;
  const content = extractCoachingContent(params.metadata);
  if (!content) return null;
  return prisma.coachingPlan.upsert({
    where: { sourceSubmissionId: params.submissionId },
    update: { ...content, status: "ACTIVE" },
    create: {
      athleteId: params.athleteId,
      drillDefinitionId: params.drillDefinitionId,
      sourceSubmissionId: params.submissionId,
      reassessmentDueAt: getCoachingPlanReassessmentDueAt(new Date()),
      ...content,
    },
  });
}

export async function backfillCoachingPlans(limit = 100) {
  const submissions = await prisma.drillSubmission.findMany({
    where: { processingStatus: "COMPLETED", coachingPlan: { is: null } },
    include: { drillDefinition: true, metricResult: true },
    orderBy: { completedAt: "asc" },
    take: limit,
  });
  let created = 0;
  for (const submission of submissions) {
    const plan = await upsertCoachingPlanForSubmission({
      submissionId: submission.id,
      athleteId: submission.athleteId,
      drillDefinitionId: submission.drillDefinitionId,
      drillSlug: submission.drillDefinition.slug,
      primaryMetricName: submission.drillDefinition.metricPrimaryKey,
      primaryMetricValue: submission.metricResult?.[
        submission.drillDefinition.metricPrimaryKey as keyof NonNullable<typeof submission.metricResult>
      ],
      metricVersion: submission.metricResult?.metricVersion ?? "unavailable",
      metadata: submission.metadata,
    });
    if (plan) created += 1;
  }
  return created;
}
