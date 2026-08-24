import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "athlete-1", role: "ATHLETE" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { drillSubmission: { findUnique: mocks.findUnique } } }));

const { GET } = await import("@/app/api/processing/status/[id]/route");

describe("GET /api/processing/status/[id]", () => {
  it("returns retry visibility without leaking storage identifiers", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "submission-1",
      athleteId: "athlete-1",
      processingStatus: "RETRYING",
      processingAttempts: 1,
      nextAttemptAt: new Date("2026-07-26T12:00:30.000Z"),
      deadLetteredAt: null,
      storageKey: "private/object/key",
      metricResult: null,
      benchmarkSnapshots: null,
      processingLogs: [],
    });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "submission-1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({ processingStatus: "RETRYING", processingAttempts: 1, nextAttemptAt: "2026-07-26T12:00:30.000Z" });
    expect(body.submission).not.toHaveProperty("storageKey");
  });
});