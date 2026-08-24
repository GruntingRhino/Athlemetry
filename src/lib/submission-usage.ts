export const DEFAULT_MONTHLY_SUBMISSION_LIMIT = 20;

type QuotaTransaction = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type UsageRow = {
  submissionCount: number;
};

export class SubmissionQuotaExceededError extends Error {
  constructor() {
    super("Monthly submission limit reached.");
    this.name = "SubmissionQuotaExceededError";
  }
}

export function getMonthlySubmissionLimit(environment: Record<string, string | undefined> = process.env) {
  const configuredLimit = environment.ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT?.trim();
  if (!configuredLimit) return DEFAULT_MONTHLY_SUBMISSION_LIMIT;

  if (!/^\d+$/.test(configuredLimit)) {
    throw new Error("ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT must be a whole number.");
  }

  const limit = Number(configuredLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT must be between 1 and 1000.");
  }

  return limit;
}

export function getSubmissionUsageMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function getMonthlySubmissionQuotaSummary(
  submissionCount: number | null | undefined,
  role?: string,
  environment: Record<string, string | undefined> = process.env,
) {
  if (role === "ADMIN") return null;

  const limit = getMonthlySubmissionLimit(environment);
  const used = typeof submissionCount === "number" && Number.isSafeInteger(submissionCount) && submissionCount > 0
    ? submissionCount
    : 0;

  return {
    limit,
    used,
    remaining: Math.max(limit - used, 0),
  };
}

export async function consumeMonthlySubmissionQuota(
  transaction: QuotaTransaction,
  user: { userId: string; role?: string },
  now = new Date(),
) {
  if (user.role === "ADMIN") return { used: 0, limit: null };

  const limit = getMonthlySubmissionLimit();
  const monthStart = getSubmissionUsageMonthStart(now);
  const rows = await transaction.$queryRaw<UsageRow[]>`
    INSERT INTO "MonthlySubmissionUsage" (
      "id", "userId", "monthStart", "submissionCount", "createdAt", "updatedAt"
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text), ${user.userId}, ${monthStart}, 1, NOW(), NOW()
    )
    ON CONFLICT ("userId", "monthStart") DO UPDATE
      SET "submissionCount" = "MonthlySubmissionUsage"."submissionCount" + 1,
          "updatedAt" = NOW()
      WHERE "MonthlySubmissionUsage"."submissionCount" < ${limit}
    RETURNING "submissionCount"
  `;

  const used = rows[0]?.submissionCount;
  if (typeof used !== "number") throw new SubmissionQuotaExceededError();
  return { used, limit };
}
