import { CAPTURE_ASSESSMENT_SOURCE } from "@/lib/capture-adherence";

export function invalidateManualOverrideEvidence(metadata: unknown) {
  const existing = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const safeExisting = { ...existing };
  delete safeExisting.performanceAssessment;

  return {
    ...safeExisting,
    performanceVerified: false,
    captureAssessment: {
      source: CAPTURE_ASSESSMENT_SOURCE,
      status: "UNVERIFIED",
      reasons: ["manual-metric-override-requires-reverification"],
    },
  };
}
