import type { MetricValidation } from "@prisma/client";

import { filterCustomerMetricResult, getReleasedMetricEvidenceTimestamp, hasReleasedMetricValue, isMetricReleased } from "@/lib/customer-metrics";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { getMetricPresentation, type MetricPresentation } from "@/lib/metric-presentation";

export type CustomerReportSubmission = {
  id: string;
  recordingDate: Date;
  location: string;
  metadata: unknown;
  metricResult: Record<string, unknown> | null;
  benchmarkSnapshots: { percentile: number } | null;
  drillDefinition: {
    id: string;
    name: string;
    slug: string;
    metricPrimaryKey: string;
    metricValidations: MetricValidation[];
  };
};

export type CustomerReportValue = {
  key: string;
  value: number;
  presentation: MetricPresentation;
  evidenceTimestamp: string;
  metricVersion: string;
  protocolVersion: string;
  previousComparableAssessment: {
    value: number;
    recordingDate: Date;
  } | null;
};

export type CustomerReport = {
  submission: CustomerReportSubmission;
  values: CustomerReportValue[];
};

export function buildCustomerReports(submissions: CustomerReportSubmission[]): CustomerReport[] {
  const reports = submissions.flatMap((submission) => {
    const protocol = DRILL_PROTOCOLS[submission.drillDefinition.slug as keyof typeof DRILL_PROTOCOLS];
    const metricVersion = typeof submission.metricResult?.metricVersion === "string"
      ? submission.metricResult.metricVersion
      : "unavailable";
    const released = new Set(
      submission.drillDefinition.metricValidations
        .filter((validation) => isMetricReleased(submission.drillDefinition.slug, validation.metricName, metricVersion, validation))
        .map((validation) => validation.metricName),
    );
    const filtered = filterCustomerMetricResult(
      submission.metricResult,
      new Set([submission.drillDefinition.metricPrimaryKey]),
      submission.metadata,
      submission.drillDefinition.slug,
    );
    if (!hasReleasedMetricValue(
      submission.metricResult,
      released,
      submission.drillDefinition.metricPrimaryKey,
      submission.metadata,
      protocol?.version ?? "unavailable",
    )) return [];

    const values = Object.entries(filtered ?? {}).flatMap(([key, value]) => {
      const presentation = getMetricPresentation(key);
      const evidenceTimestamp = presentation && typeof value === "number"
        ? getReleasedMetricEvidenceTimestamp(
            submission.metadata,
            key,
            metricVersion,
            protocol?.version ?? "unavailable",
          )
        : null;
      return presentation && typeof value === "number" && evidenceTimestamp
        ? [{
          key,
          value,
          presentation,
          evidenceTimestamp,
          metricVersion,
          protocolVersion: protocol?.version ?? "unavailable",
          previousComparableAssessment: null,
        }]
        : [];
    });
    return values.length > 0 ? [{ submission, values }] : [];
  });

  const previousByIdentity = new Map<string, { value: number; recordingDate: Date }>();
  const previousByReportValue = new Map<string, { value: number; recordingDate: Date }>();
  for (const report of [...reports].sort((left, right) => left.submission.recordingDate.getTime() - right.submission.recordingDate.getTime())) {
    for (const value of report.values) {
      const identity = [
        report.submission.drillDefinition.id,
        value.key,
        value.metricVersion,
        value.protocolVersion,
      ].join(":");
      const previous = previousByIdentity.get(identity);
      if (previous && previous.recordingDate.getTime() < report.submission.recordingDate.getTime()) {
        previousByReportValue.set(`${report.submission.id}:${value.key}`, previous);
      }
      previousByIdentity.set(identity, { value: value.value, recordingDate: report.submission.recordingDate });
    }
  }

  return reports.map((report) => ({
    ...report,
    values: report.values.map((value) => ({
      ...value,
      previousComparableAssessment: previousByReportValue.get(`${report.submission.id}:${value.key}`) ?? null,
    })),
  }));
}
