import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const premiumPages = [
  "src/app/reports/page.tsx",
  "src/app/coaching/page.tsx",
  "src/app/benchmarking/page.tsx",
];

const premiumApis = [
  "src/app/api/v1/benchmarks/route.ts",
  "src/app/api/v1/submissions/route.ts",
];

describe("paid feature boundaries", () => {
  it("explains entitlement redirects on the billing page", () => {
    const source = readFileSync("src/app/billing/page.tsx", "utf8");
    expect(source).toContain("searchParams");
    expect(source).toContain("Subscription required");
    expect(source).toContain("getBillingRecoveryState");
    expect(source).toContain("canStartNewCheckout");
    expect(source).toContain("monthlySubmissionUsage.findUnique");
    expect(source).toContain("Video submissions this month");
    expect(source).toContain("userId_monthStart");
  });

  it.each(premiumPages)("enforces entitlement before querying %s", (path) => {
    const source = readFileSync(path, "utf8");
    const gate = source.indexOf("requirePaidFeatureAccess(");
    const query = source.indexOf("prisma.");
    expect(gate).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(gate);
  });

  it.each(premiumApis)("returns payment-required before querying %s", (path) => {
    const source = readFileSync(path, "utf8");
    const gate = source.indexOf("canUsePaidFeatures(");
    const query = source.indexOf("prisma.");
    expect(gate).toBeGreaterThan(-1);
    expect(source).toContain("status: 402");
    expect(query).toBeGreaterThan(gate);
  });
});
