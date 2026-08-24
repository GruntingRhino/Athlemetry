const MAX_PROCESSING_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 30_000;

export function processingRetryDecision(attempt: number, now = new Date()) {
  if (attempt >= MAX_PROCESSING_ATTEMPTS) {
    return { terminal: true as const, nextAttemptAt: null, deadLetteredAt: now };
  }
  const delay = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  return { terminal: false as const, nextAttemptAt: new Date(now.getTime() + delay) };
}
