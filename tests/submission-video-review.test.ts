import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("submission video review", () => {
  it("uses the protected video endpoint and presents reviewed moments as non-automated observations", () => {
    const source = readFileSync("src/components/forms/submission-video-review.tsx", "utf8");
    expect(source).toContain("/api/submissions/${submissionId}/video");
    expect(source).toContain("not automated coaching, health, or performance claims");
    expect(source).toContain("Seek to moment");
  });
});
