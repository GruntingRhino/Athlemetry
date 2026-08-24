import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", email: "athlete@example.com", role: "ATHLETE" } } as { user: { id: string; email: string; role: string } } | null,
  prisma: {
    consentLog: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { GET, POST } = await import("@/app/api/privacy/model-training-consent/route");

describe("model-training consent", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "athlete-1", email: "athlete@example.com", role: "ATHLETE" } };
    mocks.prisma.consentLog.create.mockReset();
    mocks.prisma.consentLog.findFirst.mockReset();
    mocks.prisma.consentLog.findMany.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (operation) => operation(mocks.prisma));
  });

  it("defaults to denied and exposes only the authenticated user's consent history", async () => {
    mocks.prisma.consentLog.findFirst.mockResolvedValue(null);
    mocks.prisma.consentLog.findMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ granted: false, history: [] });
    expect(mocks.prisma.consentLog.findFirst).toHaveBeenCalledWith({
      where: { userId: "athlete-1", consentType: "MODEL_TRAINING" },
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.prisma.consentLog.findMany).toHaveBeenCalledWith({
      where: { userId: "athlete-1", consentType: "MODEL_TRAINING" },
      orderBy: { createdAt: "desc" },
      select: { granted: true, createdAt: true, actorUserId: true },
    });
  });

  it("rejects unauthenticated consent changes before any durable write", async () => {
    mocks.session = null;

    const response = await POST(new Request("http://localhost/api/privacy/model-training-consent", {
      method: "POST",
      body: JSON.stringify({ granted: true }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.prisma.consentLog.create).not.toHaveBeenCalled();
  });

  it("rejects a forged target account id rather than allowing cross-account consent", async () => {
    const response = await POST(new Request("http://localhost/api/privacy/model-training-consent", {
      method: "POST",
      body: JSON.stringify({ granted: true, userId: "victim-1" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.prisma.consentLog.create).not.toHaveBeenCalled();
  });

  it("records an immutable owner-attributed opt-in entry", async () => {
    mocks.prisma.consentLog.create.mockResolvedValue({});

    const response = await POST(new Request("http://localhost/api/privacy/model-training-consent", {
      method: "POST",
      body: JSON.stringify({ granted: true }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, granted: true });
    expect(mocks.prisma.consentLog.create).toHaveBeenCalledWith({
      data: {
        userId: "athlete-1",
        actorUserId: "athlete-1",
        consentType: "MODEL_TRAINING",
        granted: true,
        notes: "Explicit account-owner opt-in for model-training use.",
      },
    });
  });

  it("records withdrawal as a new immutable owner-attributed entry", async () => {
    mocks.prisma.consentLog.create.mockResolvedValue({});

    const response = await POST(new Request("http://localhost/api/privacy/model-training-consent", {
      method: "POST",
      body: JSON.stringify({ granted: false }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.consentLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "athlete-1",
        actorUserId: "athlete-1",
        consentType: "MODEL_TRAINING",
        granted: false,
        notes: "Explicit account-owner withdrawal of model-training use.",
      }),
    }));
  });

  it("fails closed when recording the consent security audit fails", async () => {
    mocks.prisma.consentLog.create.mockResolvedValue({});
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/privacy/model-training-consent", {
      method: "POST",
      body: JSON.stringify({ granted: true }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Consent could not be recorded safely." });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Model-training consent changed",
        metadata: {
          action: "MODEL_TRAINING_CONSENT_GRANTED",
          actorUserId: "athlete-1",
        },
      },
    });
  });
});
