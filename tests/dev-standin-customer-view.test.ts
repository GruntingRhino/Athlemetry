import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { sanitizeCustomerMetadata } = await import("@/lib/customer-metrics");

describe("customer metadata and the dev stand-in", () => {
  it("never exposes the stand-in report or engine label through customer APIs", () => {
    const sanitized = sanitizeCustomerMetadata({
      sport: "soccer",
      analysisEngine: "dev-vlm-standin",
      devStandIn: { engine: "dev-vlm-standin", validated: false, grade: 88 },
      visionAnalysis: { evidence: {} },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/standin|grade|visionAnalysis|analysisEngine/i);
    expect(sanitized).toMatchObject({ sport: "soccer" });
  });
});
