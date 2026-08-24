import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    team: { create: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    session: null as { user: { id: string; role: string } } | null,
    transaction,
    prisma: {
      team: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { GET, POST } = await import("@/app/api/teams/route");

function request(body: unknown) {
  return new Request("http://localhost/api/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("team foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.team.create.mockResolvedValue({
      id: "team-1",
      name: "North Stars",
      sport: "soccer",
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
    });
  });

  it("rejects anonymous and athlete team creation without accessing team records", async () => {
    expect((await POST(request({ name: "North Stars", sport: "soccer" }))).status).toBe(401);
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    expect((await POST(request({ name: "North Stars", sport: "soccer" }))).status).toBe(403);
    expect(mocks.transaction.team.create).not.toHaveBeenCalled();
  });

  it("validates bounded team details", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    expect((await POST(request({ name: "x", sport: "hockey" }))).status).toBe(400);
    expect(mocks.transaction.team.create).not.toHaveBeenCalled();
  });

  it("creates an owner-scoped team with an owner membership and minimal audit event", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };

    const response = await POST(request({ name: " North Stars ", sport: "soccer" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      team: { id: "team-1", name: "North Stars", sport: "soccer", createdAt: "2026-07-30T12:00:00.000Z" },
    });
    expect(mocks.transaction.team.create).toHaveBeenCalledWith({
      data: {
        name: "North Stars",
        sport: "soccer",
        ownerId: "coach-1",
        memberships: { create: { userId: "coach-1", role: "OWNER" } },
      },
      select: { id: true, name: true, sport: true, createdAt: true },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Team created",
        metadata: { action: "TEAM_CREATED", actorUserId: "coach-1", teamId: "team-1" },
      },
    });
  });

  it("lists only teams owned by the authenticated coach", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.prisma.team.findMany.mockResolvedValue([]);

    expect((await GET()).status).toBe(200);
    expect(mocks.prisma.team.findMany).toHaveBeenCalledWith({
      where: { ownerId: "coach-1" },
      select: { id: true, name: true, sport: true, createdAt: true, _count: { select: { memberships: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("fails closed when team creation or its audit record cannot commit", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(request({ name: "West Stars", sport: "basketball" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Team could not be created safely." });
  });
});
