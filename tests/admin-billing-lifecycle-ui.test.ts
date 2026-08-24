import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("admin billing lifecycle UI", () => {
  it("renders provider-recorded trial conversion and recent cancellation counts without customer identifiers", () => {
    const page = readFileSync("src/app/admin/page.tsx", "utf8");

    expect(page).toContain("Trial-to-paid conversion");
    expect(page).toContain("Recent cancellations");
    expect(page).toContain("billingLifecycle");
    expect(page).toContain("Provider-recorded lifecycle events only");
    expect(page).not.toContain("stripeCustomerId");
  });
});
