import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(async () => "hashed-password"),
  consoleWarn: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    consentLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.bcryptHash,
  },
}));

const { POST } = await import("@/app/api/auth/register/route");
const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
  mocks.consoleWarn(...args);
});

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    mocks.bcryptHash.mockClear();
    mocks.consoleWarn.mockClear();
    warnSpy.mockClear();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.create.mockReset();
    mocks.prisma.consentLog.create.mockReset();
  });

  it("still creates the account when consent logging fails after the user row is written", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: "user_123",
      name: "Athlete One",
      email: "athlete@example.com",
    });
    mocks.prisma.consentLog.create.mockRejectedValueOnce(new Error("consent log unavailable"));

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Athlete One",
          email: "athlete@example.com",
          password: "supersecurepassword",
          role: "ATHLETE",
          age: 18,
          position: "MID",
          team: "FC North",
          competitionLevel: "academy",
          gender: "female",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      user: {
        id: "user_123",
        name: "Athlete One",
        email: "athlete@example.com",
      },
    });
    expect(mocks.prisma.user.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.consentLog.create).toHaveBeenCalledTimes(1);
    expect(mocks.consoleWarn).toHaveBeenCalledWith(
      "Registration consent log write failed; continuing signup.",
      expect.any(Error),
    );
  });
});
