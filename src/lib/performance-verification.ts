export const PERFORMANCE_ASSESSMENT_SOURCE = "athlemetry-performance-verification-v1";

type AssessmentIdentity = {
  metricName: string;
  metricVersion: string;
  protocolVersion: string;
};

type BuildPerformanceAssessmentInput = AssessmentIdentity & {
  captureVerified: boolean;
  metricReleased: boolean;
  finiteMetricValue: boolean;
  verifiedAt: string;
};

export function resolveAnalyzerModelVersion(
  activeModelVersion: string | null,
  configuredAnalyzerVersion: string | undefined,
  production: boolean,
) {
  if (!activeModelVersion) {
    if (production) throw new Error("An active model version is required in production before analyzer output can be persisted.");
    activeModelVersion = "v1.0.0";
  }
  const configured = configuredAnalyzerVersion?.trim();
  if (!configured) {
    if (production) throw new Error("VISION_MODEL_VERSION is required in production to bind analyzer output to validated model evidence.");
    return activeModelVersion;
  }
  if (configured !== activeModelVersion) {
    throw new Error(`Analyzer model version ${configured} does not match active validated model version ${activeModelVersion}.`);
  }
  return configured;
}

export function buildPerformanceAssessment(input: BuildPerformanceAssessmentInput) {
  const verified = input.captureVerified && input.metricReleased && input.finiteMetricValue;
  return {
    source: PERFORMANCE_ASSESSMENT_SOURCE,
    status: verified ? "VERIFIED" as const : "UNVERIFIED" as const,
    metricName: input.metricName,
    metricVersion: input.metricVersion,
    protocolVersion: input.protocolVersion,
    verifiedAt: input.verifiedAt,
  };
}

export function isPerformanceAssessmentVerified(metadata: unknown, expected: AssessmentIdentity) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const assessment = (metadata as Record<string, unknown>).performanceAssessment;
  if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) return false;
  const record = assessment as Record<string, unknown>;
  return record.source === PERFORMANCE_ASSESSMENT_SOURCE
    && record.status === "VERIFIED"
    && record.metricName === expected.metricName
    && record.metricVersion === expected.metricVersion
    && record.protocolVersion === expected.protocolVersion
    && typeof record.verifiedAt === "string"
    && Number.isFinite(Date.parse(record.verifiedAt));
}
