import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { generateReferralCode, getReferralAttributionSummary, normalizeReferralCode } from "@/lib/referrals";

describe("referral codes", () => {
  it("normalizes valid shared codes without accepting malformed values", () => {
    expect(normalizeReferralCode("  ab12cd34ef56gh78 ")).toBe("AB12CD34EF56GH78");
    expect(normalizeReferralCode("too-short")).toBeUndefined();
    expect(normalizeReferralCode("AB12_CD34")).toBeUndefined();
  });

  it("generates opaque URL-safe codes", () => {
    const code = generateReferralCode();
    expect(code).toMatch(/^[A-Z0-9]{16}$/);
    expect(generateReferralCode()).not.toBe(code);
  });

  it("counts only non-deleted attributed registrations and currently entitled referrals", async () => {
    const count = vi.fn()
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3);
    const now = new Date("2026-07-30T12:00:00.000Z");

    await expect(getReferralAttributionSummary("referrer-1", { user: { count } } as never, now)).resolves.toEqual({
      attributedRegistrationCount: 7,
      currentPaidReferralCount: 3,
    });
    expect(count).toHaveBeenNthCalledWith(1, {
      where: { referredByUserId: "referrer-1", deletedAt: null },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        referredByUserId: "referrer-1",
        deletedAt: null,
        OR: expect.arrayContaining([
          expect.objectContaining({
            billingAccount: expect.objectContaining({
              is: expect.objectContaining({
                subscription: expect.objectContaining({
                  is: expect.objectContaining({ status: { in: ["active", "trialing"] }, currentPeriodEnd: { gt: now } }),
                }),
              }),
            }),
          }),
          expect.objectContaining({
            billingAccount: expect.objectContaining({
              is: expect.objectContaining({
                subscription: expect.objectContaining({
                  is: expect.objectContaining({ status: "past_due", graceUntil: { gt: now } }),
                }),
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it("renders referral aggregates without exposing referred-account details", async () => {
    const source = await readFile(path.join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

    expect(source).toContain("getReferralAttributionSummary(user.id, prisma)");
    expect(source).toContain("attributedRegistrationCount");
    expect(source).toContain("currentPaidReferralCount");
    expect(source).toContain("Counts are aggregate only.");
    expect(source).not.toContain("referrals: { select:");
  });
});