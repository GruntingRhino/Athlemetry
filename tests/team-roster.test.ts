import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    team: { findFirst: vi.fn() },
    teamMembership: { findMany: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    session: null as { user: { id: string; role: string } } | null,
    transaction,
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { GET } = await import("@/app/api/teams/[teamId]/roster/route");

describe("team roster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.team.findFirst.mockResolvedValue({ id: "team-1", name: "North Stars", sport: "soccer" });
    mocks.transaction.teamMembership.findMany.mockResolvedValue([
      {
        id: "membership-1",
        joinedAt: new Date("2026-07-30T12:00:00.000Z"),
        user: { name: "Athlete One", position: "CM" },
      },
    ]);
    mocks.transaction.systemLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("does not disclose a roster to anonymous users or non-managers", async () => {
    expect((await GET(new Request("http://localhost/api/teams/team-1/roster"), { params: Promise.resolve({ teamId: "team-1" }) })).status).toBe(401);

    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    expect((await GET(new Request("http://localhost/api/teams/team-1/roster"), { params: Promise.resolve({ teamId: "team-1" }) })).status).toBe(403);
    expect(mocks.transaction.team.findFirst).not.toHaveBeenCalled();
  });

  it("returns only confirmed athlete roster fields for the requesting owner and audits the view", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };

    const response = await GET(new Request("http://localhost/api/teams/team-1/roster"), { params: Promise.resolve({ teamId: "team-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      team: {
        id: "team-1",
        name: "North Stars",
        sport: "soccer",
        athletes: [{ membershipId: "membership-1", name: "Athlete One", position: "CM", joinedAt: "2026-07-30T12:00:00.000Z" }],
      },
    });
    expect(mocks.transaction.team.findFirst).toHaveBeenCalledWith({
      where: { id: "team-1", ownerId: "coach-1" },
      select: { id: true, name: true, sport: true },
    });
    expect(mocks.transaction.teamMembership.findMany).toHaveBeenCalledWith({
      where: { teamId: "team-1", role: "ATHLETE" },
      select: { id: true, joinedAt: true, user: { select: { name: true, position: true } } },
      orderBy: [{ user: { name: "asc" } }, { joinedAt: "asc" }],
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Team roster viewed",
        metadata: { action: "TEAM_ROSTER_VIEWED", actorUserId: "coach-1", teamId: "team-1" },
      },
    });
  });

  it("does not reveal an unowned team and fails closed if its view audit cannot commit", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.transaction.team.findFirst.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost/api/teams/team-2/roster"), { params: Promise.resolve({ teamId: "team-2" }) })).status).toBe(404);
    expect(mocks.transaction.teamMembership.findMany).not.toHaveBeenCalled();

    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));
    expect((await GET(new Request("http://localhost/api/teams/team-1/roster"), { params: Promise.resolve({ teamId: "team-1" }) })).status).toBe(503);
  });
});
