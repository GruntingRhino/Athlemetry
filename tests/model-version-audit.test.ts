import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    modelVersion: { updateMany: vi.fn(), upsert: vi.fn() },
    systemLog: { create: vi.fn() },
  };

  return {
    session: { user: { id: "admin-1", role: "ADMIN" } },
    tx,
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/admin/model/version/route");

describe("model-version activation security audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  });

  it("atomically records a minimal admin-scoped audit event when activating a model version", async () => {
    const response = await POST(new Request("http://localhost/api/admin/model/version", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "vision-v3", notes: "Validated release notes" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.modelVersion.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });
    expect(mocks.tx.modelVersion.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { version: "vision-v3" },
    }));
    expect(mocks.tx.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Model version activated",
        metadata: {
          action: "MODEL_VERSION_ACTIVATED",
          actorUserId: "admin-1",
          modelVersion: "vision-v3",
        },
      },
    });
  });

  it("fails closed when the activation audit cannot be persisted", async () => {
    mocks.tx.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/admin/model/version", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "vision-v3" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Model version activation could not be recorded safely." });
  });
});
