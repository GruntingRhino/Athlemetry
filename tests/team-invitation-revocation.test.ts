import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    team: { findFirst: vi.fn() },
    teamInvitation: { deleteMany: vi.fn() },
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

const { DELETE } = await import("@/app/api/teams/[teamId]/invitations/[invitationId]/route");

function request(teamId = "team-1", invitationId = "invitation-1") {
  return DELETE(
    new Request(`http://localhost/api/teams/${teamId}/invitations/${invitationId}`, { method: "DELETE" }),
    { params: Promise.resolve({ teamId, invitationId }) },
  );
}

describe("team invitation revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.team.findFirst.mockResolvedValue({ id: "team-1" });
    mocks.transaction.teamInvitation.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.systemLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("rejects anonymous and athlete callers before invitation access", async () => {
    expect((await request()).status).toBe(401);

    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    expect((await request()).status).toBe(403);
    expect(mocks.transaction.team.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.teamInvitation.deleteMany).not.toHaveBeenCalled();
  });

  it("allows a team owner to revoke only a pending invitation and writes a minimal audit event", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.transaction.team.findFirst).toHaveBeenCalledWith({
      where: { id: "team-1", ownerId: "coach-1" },
      select: { id: true },
    });
    expect(mocks.transaction.teamInvitation.deleteMany).toHaveBeenCalledWith({
      where: { id: "invitation-1", teamId: "team-1", status: "PENDING" },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Team invitation revoked",
        metadata: {
          action: "TEAM_INVITATION_REVOKED",
          actorUserId: "coach-1",
          teamId: "team-1",
          invitationId: "invitation-1",
        },
      },
    });
  });

  it("does not reveal unowned teams or non-pending invitations", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.transaction.team.findFirst.mockResolvedValueOnce(null);

    expect((await request("team-2")).status).toBe(404);
    expect(mocks.transaction.teamInvitation.deleteMany).not.toHaveBeenCalled();

    mocks.transaction.teamInvitation.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect((await request()).status).toBe(404);
    expect(mocks.transaction.systemLog.create).not.toHaveBeenCalled();
  });

  it("fails closed if the revocation audit cannot commit", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await request();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Team invitation could not be revoked safely." });
  });
});
