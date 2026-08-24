import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner-1", role: "ATHLETE" } } as { user: { id: string; role: string } } | null,
  prisma: {
    drillSubmission: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    submissionShare: { upsert: vi.fn() },
    submissionShareAudit: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST, DELETE } = await import("@/app/api/submissions/[id]/sharing/route");
const { GET } = await import("@/app/api/submissions/[id]/shared/route");

function shareRequest(email = "recipient@example.com") {
  return new Request("http://localhost/api/submissions/submission-1/sharing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientEmail: email }),
  });
}

function routeParams(id = "submission-1") {
  return { params: Promise.resolve({ id }) };
}

describe("per-submission sharing", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "owner-1", role: "ATHLETE" } };
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (operation) => (
      typeof operation === "function" ? operation(mocks.prisma) : Promise.all(operation)
    ));
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({ athleteId: "owner-1" });
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "recipient-1", deletedAt: null });
    mocks.prisma.submissionShare.upsert.mockResolvedValue({});
    mocks.prisma.submissionShareAudit.create.mockResolvedValue({});
  });

  it("rejects unauthenticated grants before any database access", async () => {
    mocks.session = null;

    const response = await POST(shareRequest(), routeParams());

    expect(response.status).toBe(401);
    expect(mocks.prisma.drillSubmission.findUnique).not.toHaveBeenCalled();
  });

  it("does not let another athlete grant access to a foreign submission", async () => {
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({ athleteId: "other-owner" });

    const response = await POST(shareRequest(), routeParams());

    expect(response.status).toBe(404);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.submissionShare.upsert).not.toHaveBeenCalled();
  });

  it("grants one named existing recipient read-only access and appends an audit record", async () => {
    const response = await POST(shareRequest(), routeParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, active: true });
    expect(mocks.prisma.submissionShare.upsert).toHaveBeenCalledWith({
      where: { submissionId_recipientId: { submissionId: "submission-1", recipientId: "recipient-1" } },
      create: { submissionId: "submission-1", recipientId: "recipient-1", active: true, updatedByUserId: "owner-1" },
      update: { active: true, updatedByUserId: "owner-1" },
    });
    expect(mocks.prisma.submissionShareAudit.create).toHaveBeenCalledWith({
      data: { submissionId: "submission-1", recipientId: "recipient-1", actorUserId: "owner-1", action: "GRANTED" },
    });
  });

  it("does not reveal whether a valid recipient email belongs to an existing account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const response = await POST(shareRequest("unknown@example.com"), routeParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, active: true });
    expect(mocks.prisma.submissionShare.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.submissionShareAudit.create).not.toHaveBeenCalled();
  });

  it("revokes only the owner’s named share and appends a withdrawal audit record", async () => {
    const response = await DELETE(shareRequest(), routeParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, active: false });
    expect(mocks.prisma.submissionShare.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { active: false, updatedByUserId: "owner-1" },
    }));
    expect(mocks.prisma.submissionShareAudit.create).toHaveBeenCalledWith({
      data: { submissionId: "submission-1", recipientId: "recipient-1", actorUserId: "owner-1", action: "REVOKED" },
    });
  });

  it.each([
    ["grant", POST, true],
    ["revocation", DELETE, false],
  ] as const)("fails closed when the %s audit write cannot be committed", async (_action, handler, active) => {
    mocks.prisma.submissionShareAudit.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await handler(shareRequest(), routeParams());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Sharing could not be updated safely." });
    expect(mocks.prisma.submissionShare.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.submissionShareAudit.create).toHaveBeenCalledWith({
      data: { submissionId: "submission-1", recipientId: "recipient-1", actorUserId: "owner-1", action: active ? "GRANTED" : "REVOKED" },
    });
  });

  it("does not let a non-recipient read a shared submission or its reports", async () => {
    mocks.session = { user: { id: "unrelated-1", role: "ATHLETE" } };
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/submissions/submission-1/shared"), routeParams());

    expect(response.status).toBe(404);
    expect(mocks.prisma.drillSubmission.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "submission-1", shares: { some: { recipientId: "unrelated-1", active: true } } },
    }));
    expect(mocks.prisma.submissionShareAudit.create).not.toHaveBeenCalled();
  });

  it("returns a shared submission and redacted report fields only to its active recipient", async () => {
    mocks.session = { user: { id: "recipient-1", role: "COACH" } };
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({
      id: "submission-1",
      drillType: "sprint-20m",
      recordingDate: new Date("2026-07-29T00:00:00.000Z"),
      submittedAt: new Date("2026-07-29T00:00:00.000Z"),
      processingStatus: "COMPLETED",
      drillDefinition: { name: "20m Sprint", sport: "soccer" },
      userReports: [{ id: "report-1", reason: "Review", details: "Please review", status: "OPEN", reviewedAt: null, createdAt: new Date() }],
    });

    const response = await GET(new Request("http://localhost/api/submissions/submission-1/shared"), routeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.submission).toMatchObject({ id: "submission-1", drillType: "sprint-20m" });
    expect(body.submission).not.toHaveProperty("athleteId");
    expect(body.submission).not.toHaveProperty("storageKey");
    expect(body.submission.userReports[0]).not.toHaveProperty("reporterId");
    expect(body.submission.userReports[0]).not.toHaveProperty("reviewedById");
    expect(mocks.prisma.submissionShareAudit.create).toHaveBeenCalledWith({
      data: {
        submissionId: "submission-1",
        recipientId: "recipient-1",
        actorUserId: "recipient-1",
        action: "VIEWED",
      },
    });
  });

  it("does not disclose a report's private narrative or reporter context to a share recipient", async () => {
    mocks.session = { user: { id: "recipient-1", role: "COACH" } };
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({
      id: "submission-1",
      drillType: "sprint-20m",
      recordingDate: new Date("2026-07-29T00:00:00.000Z"),
      submittedAt: new Date("2026-07-29T00:00:00.000Z"),
      processingStatus: "COMPLETED",
      drillDefinition: { name: "20m Sprint", sport: "soccer" },
      userReports: [{ id: "report-1", status: "OPEN", reviewedAt: null, createdAt: new Date() }],
    });

    const response = await GET(new Request("http://localhost/api/submissions/submission-1/shared"), routeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.submission.userReports[0]).toEqual({
      id: "report-1",
      status: "OPEN",
      reviewedAt: null,
      createdAt: expect.any(String),
    });
    expect(mocks.prisma.drillSubmission.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        userReports: expect.objectContaining({
          select: { id: true, status: true, reviewedAt: true, createdAt: true },
        }),
      }),
    }));
  });

  it("fails closed rather than returning a shared submission when access auditing fails", async () => {
    mocks.session = { user: { id: "recipient-1", role: "COACH" } };
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({ id: "submission-1" });
    mocks.prisma.submissionShareAudit.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await GET(new Request("http://localhost/api/submissions/submission-1/shared"), routeParams());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Shared submission could not be retrieved safely." });
  });
});
