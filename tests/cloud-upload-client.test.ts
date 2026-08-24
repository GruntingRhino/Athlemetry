import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("direct cloud upload client", () => {
  it("does not resend metadata already hoisted into the signed URL", () => {
    const source = readFileSync("src/components/forms/upload-form.tsx", "utf8");

    expect(source).toContain('upload.setRequestHeader("Content-Type", video.type)');
    expect(source).not.toContain('upload.setRequestHeader("x-amz-meta-sha256"');
    expect(source).toContain("uploadClaim: presign.uploadClaim");
  });
});