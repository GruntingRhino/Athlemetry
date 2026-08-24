export const VERIFIED_OUTCOME_SOURCE = "independent-outcome-review-v1";

export function verifiedOutcomeEvidence(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const outcome = (metadata as Record<string, unknown>).verifiedOutcomes;
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return undefined;
  const record = outcome as Record<string, unknown>;
  if (record.source !== VERIFIED_OUTCOME_SOURCE || record.status !== "VERIFIED") return undefined;

  const attempts = record.attempts;
  const successes = record.successes;
  if (
    typeof attempts !== "number"
    || !Number.isInteger(attempts)
    || attempts <= 0
    || typeof successes !== "number"
    || !Number.isInteger(successes)
    || successes < 0
    || successes > attempts
  ) return undefined;

  const reviewedBy = record.reviewedBy;
  if (
    !Array.isArray(reviewedBy)
    || reviewedBy.length < 2
    || reviewedBy.some((reviewer) => typeof reviewer !== "string" || reviewer.trim().length === 0)
    || new Set(reviewedBy).size !== reviewedBy.length
  ) return undefined;

  if (typeof record.evidenceUri !== "string") return undefined;
  try {
    const evidenceUri = new URL(record.evidenceUri);
    if (evidenceUri.protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }

  return { attempts, successes };
}
