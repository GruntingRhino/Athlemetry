import type { MetricValidation } from "@prisma/client";

import { isCaptureVerified } from "@/lib/capture-adherence";
import { evaluateCapabilityRelease } from "@/lib/capability-validation";
import { DRILL_PROTOCOLS, evaluateMetricRelease } from "@/lib/drill-protocols";
import { isPerformanceAssessmentVerified, PERFORMANCE_ASSESSMENT_SOURCE } from "@/lib/performance-verification";
import { prisma } from "@/lib/prisma";

export async function getActiveMetricModelVersion() {
  const model = await prisma.modelVersion.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  return model?.version ?? "unavailable";
}

export function isValidationEvidenceComplete(validation: {
  evidenceUri: string | null;
  evidenceSha256: string | null;
  reviewedBy: string | null;
}) {
  const reviewers = validation.reviewedBy?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return Boolean(
    validation.evidenceUri
    && /^https:\/\//.test(validation.evidenceUri)
    && validation.evidenceSha256
    && /^[a-f0-9]{64}$/i.test(validation.evidenceSha256)
    && new Set(reviewers).size >= 2,
  );
}

const CUSTOMER_METRIC_PROVENANCE_FIELDS = new Set([
  "id",
  "submissionId",
  "metricVersion",
  "reliabilityScore",
  "createdAt",
]);

const CUSTOMER_METADATA_FIELDS = new Set([
  "sport",
  "cameraAngle",
  "clipQuality",
  "measurementDistanceFeet",
  "reviewRetentionDays",
  "captureAssessment",
]);

export function filterCustomerMetricResult<T extends Record<string, unknown>>(
  metricResult: T | null,
  releasedMetricNames: Set<string>,
  submissionMetadata: unknown,
  drillSlug: string,
) {
  const protocol = DRILL_PROTOCOLS[drillSlug as keyof typeof DRILL_PROTOCOLS];
  if (!metricResult || !protocol || !isCaptureVerified(submissionMetadata)) return null;

  const filtered = Object.fromEntries(
    Object.entries(metricResult).filter(([key]) => {
      if (CUSTOMER_METRIC_PROVENANCE_FIELDS.has(key)) return true;
      return hasReleasedMetricValue(metricResult, releasedMetricNames, key, submissionMetadata, protocol.version);
    }),
  );
  const hasPerformanceMetric = Object.keys(filtered).some((key) => !CUSTOMER_METRIC_PROVENANCE_FIELDS.has(key));
  return hasPerformanceMetric ? filtered : null;
}

export function hasReleasedMetricValue(
  metricResult: Record<string, unknown> | null,
  releasedMetricNames: Set<string>,
  metricName: string,
  submissionMetadata: unknown,
  protocolVersion: string,
) {
  if (!metricResult || !releasedMetricNames.has(metricName) || !isCaptureVerified(submissionMetadata)) {
    return false;
  }
  const metricVersion = metricResult.metricVersion;
  if (typeof metricVersion !== "string" || !isPerformanceAssessmentVerified(submissionMetadata, {
    metricName,
    metricVersion,
    protocolVersion,
  })) return false;
  const value = metricResult[metricName];
  return typeof value === "number" && Number.isFinite(value);
}

export function getReleasedMetricEvidenceTimestamp(
  submissionMetadata: unknown,
  metricName: string,
  metricVersion: string,
  protocolVersion: string,
) {
  if (!isPerformanceAssessmentVerified(submissionMetadata, { metricName, metricVersion, protocolVersion })) {
    return null;
  }

  const assessment = (submissionMetadata as { performanceAssessment: { verifiedAt: string } }).performanceAssessment;
  return assessment.verifiedAt;
}

export function sanitizeCustomerMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const record = metadata as Record<string, unknown>;
  const sanitized = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => CUSTOMER_METADATA_FIELDS.has(key)),
  );
  const assessment = record.performanceAssessment;
  if (assessment && typeof assessment === "object" && !Array.isArray(assessment)) {
    const value = assessment as Record<string, unknown>;
    if (
      value.source === PERFORMANCE_ASSESSMENT_SOURCE
      && (value.status === "VERIFIED" || value.status === "UNVERIFIED")
      && typeof value.metricName === "string"
      && typeof value.metricVersion === "string"
      && typeof value.protocolVersion === "string"
      && typeof value.verifiedAt === "string"
      && Number.isFinite(Date.parse(value.verifiedAt))
    ) {
      sanitized.performanceAssessment = {
        source: value.source,
        status: value.status,
        metricName: value.metricName,
        metricVersion: value.metricVersion,
        protocolVersion: value.protocolVersion,
        verifiedAt: value.verifiedAt,
      };
    }
  }
  return sanitized;
}

export function isMetricReleased(
  drillSlug: string,
  metricName: string,
  modelVersion: string,
  validation: Pick<
    MetricValidation,
    | "status"
    | "sampleSize"
    | "p90Error"
    | "failureRate"
    | "confidenceCalibrationError"
    | "expertAgreement"
    | "independentlyReviewedAt"
    | "modelVersion"
    | "evidenceUri"
    | "evidenceSha256"
    | "reviewedBy"
    | "capabilityEvidence"
  > | null | undefined,
) {
  if (
    !validation ||
    !isValidationEvidenceComplete(validation) ||
    !evaluateCapabilityRelease(validation.capabilityEvidence).released ||
    validation.modelVersion !== modelVersion ||
    validation.p90Error === null ||
    validation.failureRate === null ||
    validation.confidenceCalibrationError === null ||
    validation.expertAgreement === null
  ) {
    return false;
  }

  return evaluateMetricRelease(drillSlug, metricName, {
    status: validation.status as "DRAFT" | "COLLECTING" | "VALIDATED" | "REJECTED",
    sampleSize: validation.sampleSize,
    p90Error: validation.p90Error,
    failureRate: validation.failureRate,
    confidenceCalibrationError: validation.confidenceCalibrationError,
    expertAgreement: validation.expertAgreement,
    independentlyReviewedAt: validation.independentlyReviewedAt,
  }).released;
}

export async function getReleasedMetricNames(drillDefinitionId: string, drillSlug: string, modelVersion: string) {
  const protocol = DRILL_PROTOCOLS[drillSlug as keyof typeof DRILL_PROTOCOLS];
  if (!protocol) return new Set<string>();

  const validations = await prisma.metricValidation.findMany({
    where: {
      drillDefinitionId,
      protocolVersion: protocol.version,
      modelVersion,
      metricName: { in: protocol.metrics.map((metric) => metric.key) },
    },
  });

  return new Set(
    validations
      .filter((validation) => isMetricReleased(drillSlug, validation.metricName, modelVersion, validation))
      .map((validation) => validation.metricName),
  );
}

export async function isPrimaryMetricReleased(params: {
  drillDefinitionId: string;
  drillSlug: string;
  metricName: string;
  modelVersion: string;
}) {
  const protocol = DRILL_PROTOCOLS[params.drillSlug as keyof typeof DRILL_PROTOCOLS];
  if (!protocol) return false;

  const validation = await prisma.metricValidation.findUnique({
    where: {
      drillDefinitionId_metricName_protocolVersion_modelVersion: {
        drillDefinitionId: params.drillDefinitionId,
        metricName: params.metricName,
        protocolVersion: protocol.version,
        modelVersion: params.modelVersion,
      },
    },
  });

  return isMetricReleased(params.drillSlug, params.metricName, params.modelVersion, validation);
}
