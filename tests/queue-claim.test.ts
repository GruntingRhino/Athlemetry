import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

const { claimReadySubmissionIds } = await import("@/lib/processing/queue-claim");

describe("atomic queue batch claims", () => {
  beforeEach(() => queryRaw.mockReset());

  it("returns only rows atomically claimed by PostgreSQL", async () => {
    queryRaw.mockResolvedValue([{ id: "submission-a" }, { id: "submission-b" }]);
    await expect(claimReadySubmissionIds(2, new Date("2026-07-27T12:00:00.000Z"))).resolves.toEqual([
      "submission-a",
      "submission-b",
    ]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("bounds claim size to protect worker memory", async () => {
    queryRaw.mockResolvedValue([]);
    await claimReadySubmissionIds(10_000);
    const query = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(query.values).toContain(100);
  });

  it("claims currently entitled athletes before non-entitled work while preserving FIFO within each tier", async () => {
    queryRaw.mockResolvedValue([]);

    await claimReadySubmissionIds(10, new Date("2026-07-30T15:00:00.000Z"));

    const query = queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join("?");
    expect(sql).toContain('LEFT JOIN "BillingAccount" AS account ON account."userId" = submission."athleteId"');
    expect(sql).toContain('LEFT JOIN "BillingSubscription" AS subscription ON subscription."billingAccountId" = account."id"');
    expect(sql).toContain("subscription.\"status\" IN ('active', 'trialing')");
    expect(sql).toContain("subscription.\"status\" = 'past_due'");
    expect(sql).toContain('ORDER BY\n        CASE');
    expect(sql).toContain('submission."queuedAt" ASC');
    expect(sql).toContain('FOR UPDATE OF submission SKIP LOCKED');
  });
});