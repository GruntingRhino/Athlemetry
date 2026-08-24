import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canUsePaidFeatures: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/billing", () => ({
  canUsePaidFeatures: mocks.canUsePaidFeatures,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { requirePaidFeatureAccess } from "@/lib/billing-access";

describe("requirePaidFeatureAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows entitled users without redirecting", async () => {
    mocks.canUsePaidFeatures.mockResolvedValue(true);

    await requirePaidFeatureAccess({ id: "user_paid", role: "ATHLETE" });

    expect(mocks.canUsePaidFeatures).toHaveBeenCalledWith("user_paid", "ATHLETE");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects non-entitled users to the subscription page", async () => {
    mocks.canUsePaidFeatures.mockResolvedValue(false);

    await requirePaidFeatureAccess({ id: "user_free", role: "ATHLETE" });

    expect(mocks.redirect).toHaveBeenCalledWith("/billing?required=subscription");
  });
});
