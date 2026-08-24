export type SubscriptionLifecycleTimestamps = {
  trialStartedAt: Date | null;
  firstPaidAt: Date | null;
};

export function calculateTrialConversionRate({
  trialStartedCount,
  convertedCount,
}: {
  trialStartedCount: number;
  convertedCount: number;
}) {
  if (trialStartedCount <= 0) return null;
  return Math.round((Math.min(convertedCount, trialStartedCount) / trialStartedCount) * 1000) / 10;
}

export function deriveSubscriptionLifecycleTimestamps(
  existing: SubscriptionLifecycleTimestamps | null,
  incomingStatus: string,
  occurredAt: Date,
): SubscriptionLifecycleTimestamps {
  const trialStartedAt = existing?.trialStartedAt ?? (incomingStatus === "trialing" ? occurredAt : null);
  const firstPaidAt = existing?.firstPaidAt ?? (incomingStatus === "active" && trialStartedAt ? occurredAt : null);

  return { trialStartedAt, firstPaidAt };
}
