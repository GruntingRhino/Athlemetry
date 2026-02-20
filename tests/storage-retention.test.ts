import { describe, expect, it } from "vitest";

import {
  getVideoExpiryDate,
  shouldPurgeOnTerminalFailure,
} from "@/lib/storage";

describe("video retention policy", () => {
  it("computes retention expiry in the future", () => {
    const now = new Date("2026-02-20T10:00:00.000Z");
    const expiresAt = getVideoExpiryDate(now);

    expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("keeps failed videos when retain flag is set", () => {
    const result = shouldPurgeOnTerminalFailure(true);
    expect(result).toBe(false);
  });
});
