import { describe, expect, it } from "vitest";

import { hashVerificationToken, verificationTokenExpiry } from "@/lib/verification-tokens";

describe("verification tokens", () => {
  it("hashes a token deterministically without retaining its raw value", () => {
    expect(hashVerificationToken("raw-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashVerificationToken("raw-token")).toBe(hashVerificationToken("raw-token"));
    expect(hashVerificationToken("raw-token")).not.toBe("raw-token");
  });

  it("sets a bounded expiry", () => {
    const now = new Date("2026-07-24T00:00:00.000Z");
    expect(verificationTokenExpiry(now).toISOString()).toBe("2026-07-25T00:00:00.000Z");
  });
});
