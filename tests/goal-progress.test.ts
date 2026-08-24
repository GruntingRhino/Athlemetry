import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    goalProgressCheckIn: { create: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    session: null as { user: { id: string } } | null,
    findUnique: vi.fn(),
    findMany: vi.fn(),
    transaction,
    prisma: {
      user: { findUnique: vi.fn() },
      goalProgressCheckIn: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { GET, POST } = await import("@/app/api/goals/progress/route");

function request(body: unknown) {
  return new Request("http://localhost/api/goals/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("goal progress check-ins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.prisma.user.findUnique.mockResolvedValue({ performanceGoal: "Improve sprint time", deletedAt: null });
    mocks.transaction.goalProgressCheckIn.create.mockResolvedValue({
      progressPercent: 40,
      note: "Completed two sessions.",
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
    });
  });

  it("rejects anonymous reads and writes", async () => {
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ progressPercent: 40 }))).status).toBe(401);
    expect(mocks.prisma.goalProgressCheckIn.findMany).not.toHaveBeenCalled();
  });

  it("returns only the authenticated athlete's recent check-ins", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.prisma.goalProgressCheckIn.findMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.prisma.goalProgressCheckIn.findMany).toHaveBeenCalledWith({
      where: { athleteId: "athlete-1" },
      select: { progressPercent: true, note: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });

  it("rejects malformed progress values and accounts without a current goal", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    expect((await POST(request({ progressPercent: 101 }))).status).toBe(400);

    expect((await POST(request({ progressPercent: 40, note: "Email me at athlete@example.com" }))).status).toBe(400);
    expect((await POST(request({ progressPercent: 40, note: "See https://example.com" }))).status).toBe(400);
    expect((await POST(request({ progressPercent: 40, note: "Call 555-123-4567" }))).status).toBe(400);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();

    mocks.prisma.user.findUnique.mockResolvedValue({ performanceGoal: null, deletedAt: null });
    expect((await POST(request({ progressPercent: 40 }))).status).toBe(409);
    expect(mocks.transaction.goalProgressCheckIn.create).not.toHaveBeenCalled();
  });

  it("records a bounded self-reported check-in and minimal audit event atomically", async () => {
    mocks.session = { user: { id: "athlete-1" } };

    const response = await POST(request({ progressPercent: 40, note: "Completed two sessions." }));

    expect(response.status).toBe(200);
    expect(mocks.transaction.goalProgressCheckIn.create).toHaveBeenCalledWith({
      data: { athleteId: "athlete-1", progressPercent: 40, note: "Completed two sessions." },
      select: { progressPercent: true, note: true, createdAt: true },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Goal progress check-in recorded",
        metadata: { action: "GOAL_PROGRESS_CHECK_IN_RECORDED", actorUserId: "athlete-1" },
      },
    });
  });

  it("fails closed when the audit event cannot be written", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(request({ progressPercent: 40 }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Goal progress check-in could not be recorded safely." });
  });
});
