import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUploadClaim, verifyUploadClaim } from "@/lib/upload-claims";

const claim = {
  userId: "user-1",
  storageKey: "2026-07-27/550e8400-e29b-41d4-a716-446655440000.mp4",
  contentLength: 1234,
  contentType: "video/mp4",
  sha256: "a".repeat(64),
};

describe("direct upload ownership claims", () => {
  beforeEach(() => {
    process.env.UPLOAD_CLAIM_SECRET = "upload-claim-test-secret-that-is-long-enough";
  });

  afterEach(() => {
    delete process.env.UPLOAD_CLAIM_SECRET;
  });

  it("binds a short-lived claim to its owner and exact object metadata", () => {
    const token = createUploadClaim(claim, new Date("2026-07-27T00:00:00Z"));

    expect(verifyUploadClaim(token, claim, new Date("2026-07-27T00:14:59Z"))).toBe(true);
    expect(verifyUploadClaim(token, { ...claim, userId: "user-2" }, new Date("2026-07-27T00:01:00Z"))).toBe(false);
    expect(verifyUploadClaim(token, { ...claim, contentLength: 1235 }, new Date("2026-07-27T00:01:00Z"))).toBe(false);
  });

  it("rejects tampered and expired claims", () => {
    const token = createUploadClaim(claim, new Date("2026-07-27T00:00:00Z"));
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyUploadClaim(tampered, claim, new Date("2026-07-27T00:01:00Z"))).toBe(false);
    expect(verifyUploadClaim(token, claim, new Date("2026-07-27T00:15:01Z"))).toBe(false);
  });

  it("fails closed without a claim secret", () => {
    delete process.env.UPLOAD_CLAIM_SECRET;
    expect(() => createUploadClaim(claim)).toThrow("UPLOAD_CLAIM_SECRET");
  });
});