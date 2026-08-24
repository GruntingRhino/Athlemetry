import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "parent-1", email: "parent@example.com", role: "PARENT" } },
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    consentLog: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/consent/approve/route");

function request(athleteEmail = "athlete@example.com") {
  return new Request("http://localhost/api/consent/approve", {
    method: "POST",
    body: JSON.stringify({ athleteEmail }),
  });
}

describe("POST /api/consent/approve", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "parent-1", email: "parent@example.com", role: "PARENT" } };
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.update.mockReset();
    mocks.prisma.consentLog.create.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("returns 400 for malformed consent input instead of reaching Prisma", async () => {
    const response = await POST(new Request("http://localhost/api/consent/approve", {
      method: "POST",
      body: JSON.stringify({ athleteEmail: 123 }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a parent attempting to approve an unrelated athlete", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "athlete-1", role: "ATHLETE", age: 15, parentEmail: "other@example.com" });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows the registered parent to approve their athlete", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "athlete-1", role: "ATHLETE", age: 15, parentEmail: "parent@example.com" });
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.prisma.consentLog.create.mockResolvedValue({});
    mocks.prisma.systemLog.create.mockResolvedValue({});
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "athlete-1" } }));
    expect(mocks.prisma.consentLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ notes: expect.not.stringContaining("@") }),
    }));
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Parental consent approval updated",
        metadata: {
          action: "PARENTAL_CONSENT_APPROVAL_UPDATED",
          actorUserId: "parent-1",
          athleteId: "athlete-1",
          granted: true,
        },
      },
    });
  });

  it("fails closed when the parental-consent audit record cannot be written", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "athlete-1", role: "ATHLETE", age: 15, parentEmail: "parent@example.com" });
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.prisma.consentLog.create.mockResolvedValue({});
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Consent approval could not be recorded safely." });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    { role: "ATHLETE", age: 18, label: "adult athlete" },
    { role: "COACH", age: 15, label: "non-athlete account" },
  ])("rejects parental approval for a $label", async ({ role, age }) => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "target-1",
      role,
      age,
      parentEmail: "parent@example.com",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.consentLog.create).not.toHaveBeenCalled();
  });
});
