import { describe, expect, it } from "vitest";

import { formatLocalDateTime, formatStableDate } from "@/app/submissions/local-time-format";

describe("submission timestamps", () => {
  const iso = "2026-11-08T17:18:50.000Z";

  it("uses a timezone-independent date for the server render and bad input", () => {
    expect(formatStableDate(iso)).toBe("2026-11-08 UTC");
    expect(formatStableDate("nope")).toBe("Unknown time");
    expect(formatLocalDateTime("nope")).toBe("Unknown time");
  });

  it("formats in the viewer's timezone, not UTC", () => {
    expect(formatLocalDateTime(iso, "en-US", "UTC")).toBe("Nov 8, 2026, 5:18 PM");
    expect(formatLocalDateTime(iso, "en-US", "America/Los_Angeles")).toBe("Nov 8, 2026, 9:18 AM");
    expect(formatLocalDateTime(iso, "en-US", "Asia/Tokyo")).toBe("Nov 9, 2026, 2:18 AM");
  });

  it("falls back to the stable date when the timezone is unusable", () => {
    expect(formatLocalDateTime(iso, "en-US", "Not/AZone")).toBe("2026-11-08 UTC");
  });
});
