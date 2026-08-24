import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("password reset user interface", () => {
  it("provides request and reset pages and links recovery from sign in", () => {
    const login = readFileSync("src/app/login/page.tsx", "utf8");
    const forgot = readFileSync("src/app/forgot-password/page.tsx", "utf8");
    const reset = readFileSync("src/app/reset-password/page.tsx", "utf8");

    expect(login).toContain('href="/forgot-password"');
    expect(forgot).toContain("PasswordResetRequestForm");
    expect(reset).toContain("PasswordResetConfirmForm");
  });
});
