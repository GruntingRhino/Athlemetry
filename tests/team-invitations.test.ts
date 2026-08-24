import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    teamInvitation: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    teamMembership: { count: vi.fn(), upsert: vi.fn() },
    billingSubscription: { findFirst: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    session: null as { user: { id: string; role: string } } | null,
    checkDatabaseRateLimit: vi.fn(),
    rateLimitSource: vi.fn(() => "203.0.113.44"),
    transaction,
    prisma: {
      team: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.checkDatabaseRateLimit,
  rateLimitSource: mocks.rateLimitSource,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST: createInvitation } = await import("@/app/api/teams/[teamId]/invitations/route");
const { GET: listInvitations } = await import("@/app/api/team-invitations/route");
const { POST: respondToInvitation } = await import("@/app/api/team-invitations/[id]/route");

function createRequest(recipientEmail = "athlete@example.com") {
  return new Request("http://localhost/api/teams/team-1/invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientEmail }),
  });
}

function responseRequest(action: string) {
  return new Request("http://localhost/api/team-invitations/invitation-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

describe("team invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.checkDatabaseRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.teamInvitation.findUnique.mockResolvedValue(null);
    mocks.transaction.teamInvitation.count.mockResolvedValue(0);
    mocks.transaction.teamMembership.count.mockResolvedValue(1);
    mocks.transaction.billingSubscription.findFirst.mockResolvedValue({ seatLimit: 25 });
    mocks.transaction.teamInvitation.create.mockResolvedValue({
      id: "invitation-1",
      status: "PENDING",
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
      expiresAt: new Date("2026-08-13T12:00:00.000Z"),
    });
    mocks.transaction.teamInvitation.findFirst.mockResolvedValue({ id: "invitation-1", teamId: "team-1" });
    mocks.transaction.teamInvitation.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.teamMembership.upsert.mockResolvedValue({ id: "membership-1" });
    mocks.transaction.systemLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("allows only a team owner to invite an existing matching-sport athlete and writes an audit event", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.prisma.team.findFirst.mockResolvedValue({ id: "team-1", sport: "soccer" });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "athlete-1" });

    const response = await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) });

    expect(response.status).toBe(201);
    expect(mocks.prisma.team.findFirst).toHaveBeenCalledWith({ where: { id: "team-1", ownerId: "coach-1" }, select: { id: true, sport: true } });
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "athlete@example.com", role: "ATHLETE", primarySport: "soccer", deletedAt: null },
      select: { id: true },
    });
    expect(mocks.transaction.teamInvitation.findUnique).toHaveBeenCalledWith({
      where: { teamId_recipientId: { teamId: "team-1", recipientId: "athlete-1" } },
      select: { id: true, status: true, expiresAt: true },
    });
    expect(mocks.transaction.teamInvitation.create).toHaveBeenCalledWith({
      data: { teamId: "team-1", recipientId: "athlete-1", inviterId: "coach-1", expiresAt: expect.any(Date) },
      select: { id: true, status: true, createdAt: true, expiresAt: true },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { action: "TEAM_INVITATION_CREATED", actorUserId: "coach-1", teamId: "team-1", invitationId: "invitation-1" } }),
    }));
  });

  it("reissues only an expired pending invitation with a fresh expiry and distinct audit action", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.prisma.team.findFirst.mockResolvedValue({ id: "team-1", sport: "soccer" });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "athlete-1" });
    mocks.transaction.teamInvitation.findUnique.mockResolvedValue({
      id: "expired-invitation",
      status: "PENDING",
      expiresAt: new Date("2026-07-29T12:00:00.000Z"),
    });
    mocks.transaction.teamInvitation.update.mockResolvedValue({
      id: "expired-invitation",
      status: "PENDING",
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
      expiresAt: new Date("2026-08-13T12:00:00.000Z"),
    });

    expect((await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) })).status).toBe(201);
    expect(mocks.transaction.teamInvitation.update).toHaveBeenCalledWith({
      where: { id: "expired-invitation" },
      data: { inviterId: "coach-1", createdAt: expect.any(Date), expiresAt: expect.any(Date) },
      select: { id: true, status: true, createdAt: true, expiresAt: true },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { action: "TEAM_INVITATION_REISSUED", actorUserId: "coach-1", teamId: "team-1", invitationId: "expired-invitation" } }),
    }));
  });

  it("does not reveal or invite athletes to an unowned team", async () => {
    mocks.session = { user: { id: "coach-2", role: "COACH" } };
    mocks.prisma.team.findFirst.mockResolvedValue(null);

    expect((await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) })).status).toBe(404);
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.teamInvitation.create).not.toHaveBeenCalled();
  });

  it("rate limits team invitation attempts before parsing or athlete lookup", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.checkDatabaseRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 45 });

    const response = await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(await response.json()).toEqual({ error: "Too many team invitation attempts. Try again later." });
    expect(mocks.checkDatabaseRateLimit).toHaveBeenCalledWith({
      namespace: "team-invitation-source",
      identifier: "203.0.113.44",
      windowMs: 60 * 60_000,
      maxRequests: 30,
    });
    expect(mocks.prisma.team.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("applies a separate durable per-owner invitation limit", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.checkDatabaseRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });

    const response = await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.checkDatabaseRateLimit).toHaveBeenNthCalledWith(2, {
      namespace: "team-invitation-owner",
      identifier: "coach-1",
      windowMs: 60 * 60_000,
      maxRequests: 20,
    });
    expect(mocks.prisma.team.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed when team invitation abuse protection is unavailable", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.checkDatabaseRateLimit.mockRejectedValueOnce(new Error("rate limit unavailable"));

    const response = await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Team invitation protection is temporarily unavailable." });
    expect(mocks.prisma.team.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed when invitation audit writing fails", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    mocks.prisma.team.findFirst.mockResolvedValue({ id: "team-1", sport: "soccer" });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "athlete-1" });
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    expect((await createInvitation(createRequest(), { params: Promise.resolve({ teamId: "team-1" }) })).status).toBe(503);
  });

  it("lists only an athlete's own pending invitations", async () => {
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.transaction.teamInvitation.findMany.mockResolvedValue([]);

    expect((await listInvitations()).status).toBe(200);
    expect(mocks.transaction.teamInvitation.findMany).toHaveBeenCalledWith({
      where: { recipientId: "athlete-1", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      select: { id: true, createdAt: true, expiresAt: true, team: { select: { name: true, sport: true } } },
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { action: "TEAM_INVITATIONS_VIEWED", actorUserId: "athlete-1" } }),
    }));
  });

  it("fails closed rather than returning invitation data when the view audit cannot commit", async () => {
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await listInvitations();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Team invitations could not be loaded safely." });
  });

  it("accepts only the athlete's pending invitation, creates an athlete membership, and audits it", async () => {
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };

    const response = await respondToInvitation(responseRequest("accept"), { params: Promise.resolve({ id: "invitation-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.transaction.teamInvitation.findFirst).toHaveBeenCalledWith({
      where: { id: "invitation-1", recipientId: "athlete-1", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      select: { id: true, teamId: true },
    });
    expect(mocks.transaction.teamMembership.upsert).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: "team-1", userId: "athlete-1" } },
      update: {},
      create: { teamId: "team-1", userId: "athlete-1", role: "ATHLETE" },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { action: "TEAM_INVITATION_ACCEPTED", actorUserId: "athlete-1", teamId: "team-1", invitationId: "invitation-1" } }),
    }));
  });

  it("does not accept an expired invitation or create a membership", async () => {
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.transaction.teamInvitation.findFirst.mockResolvedValue(null);

    expect((await respondToInvitation(responseRequest("accept"), { params: Promise.resolve({ id: "invitation-1" }) })).status).toBe(404);
    expect(mocks.transaction.teamMembership.upsert).not.toHaveBeenCalled();
    expect(mocks.transaction.teamInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("declines without creating membership and fails closed when its audit cannot commit", async () => {
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await respondToInvitation(responseRequest("decline"), { params: Promise.resolve({ id: "invitation-1" }) });

    expect(response.status).toBe(503);
    expect(mocks.transaction.teamMembership.upsert).not.toHaveBeenCalled();
  });
});
