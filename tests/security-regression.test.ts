import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1", email: "athlete@example.com", role: "ATHLETE" } },
  bcryptCompare: vi.fn(),
  processSubmission: vi.fn(),
  rateLimit: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    drillSubmission: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    consentLog: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
    session: { deleteMany: vi.fn() },
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.bcryptCompare } }));
vi.mock("@/lib/processing/queue", () => ({ processSubmission: mocks.processSubmission }));
vi.mock("@/lib/distributed-rate-limit", () => ({ checkDatabaseRateLimit: mocks.rateLimit }));

const { POST: RetryPost } = await import("@/app/api/submissions/[id]/retry/route");
const { GET: SubmissionsGet } = await import("@/app/api/submissions/route");
const { PATCH: ProfilePatch } = await import("@/app/api/profile/route");
const { POST: PrivacyDeletePost } = await import("@/app/api/privacy/delete/route");

function jsonRequest(url: string, body?: Record<string, unknown>) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/submissions/[id]/retry — guards against retrying non-failed submissions", () => {
  beforeEach(() => {
    delete process.env.INLINE_PROCESSING_ENABLED;
    mocks.prisma.drillSubmission.findUnique.mockReset();
    mocks.prisma.drillSubmission.update.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.processSubmission.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("rejects retry of a COMPLETED submission with 409", async () => {
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      id: "sub-1",
      athleteId: "user-1",
      processingStatus: "COMPLETED",
    });

    const response = await RetryPost(
      new Request("http://localhost/api/submissions/sub-1/retry"),
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/only failed/i);
    expect(mocks.prisma.drillSubmission.update).not.toHaveBeenCalled();
  });

  it("queues retry of a FAILED submission without inline production work", async () => {
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      id: "sub-1",
      athleteId: "user-1",
      processingStatus: "FAILED",
    });
    mocks.prisma.drillSubmission.update.mockResolvedValue({});
    mocks.processSubmission.mockResolvedValue({ ok: true });

    const response = await RetryPost(
      new Request("http://localhost/api/submissions/sub-1/retry"),
      { params: Promise.resolve({ id: "sub-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.prisma.drillSubmission.update).toHaveBeenCalled();
    expect(mocks.processSubmission).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent submission", async () => {
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue(null);

    const response = await RetryPost(
      new Request("http://localhost/api/submissions/sub-404/retry"),
      { params: Promise.resolve({ id: "sub-404" }) },
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /api/submissions — soft-deleted users are rejected", () => {
  beforeEach(() => {
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.drillSubmission.findMany.mockReset();
  });

  it("returns 404 when the requester is soft-deleted", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ deletedAt: new Date() });

    const response = await SubmissionsGet();

    expect(response.status).toBe(404);
    expect(mocks.prisma.drillSubmission.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the requester no longer exists", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const response = await SubmissionsGet();

    expect(response.status).toBe(404);
    expect(mocks.prisma.drillSubmission.findMany).not.toHaveBeenCalled();
  });

  it("returns submissions for an active user", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ deletedAt: null });
    mocks.prisma.drillSubmission.findMany.mockResolvedValue([]);

    const response = await SubmissionsGet();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.submissions).toEqual([]);
  });
});

describe("PATCH /api/profile — minor age edit rejection", () => {
  const minorProfilePayload = {
    name: "Athlete One",
    age: 15,
    primarySport: "soccer",
    performanceGoal: "Improve sprint time.",
    position: "MID",
    competitionLevel: "academy",
    gender: "female",
    shareInBenchmarks: true,
    anonymizeForBenchmark: true,
  };

  beforeEach(() => {
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.update.mockReset();
    mocks.prisma.consentLog.create.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("rejects age change for a minor with 403", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      age: 14,
      parentConsentVerified: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
    });

    const response = await ProfilePatch(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(minorProfilePayload),
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/age changes for minor/i);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows age change for an adult user", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      age: 25,
      parentConsentVerified: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
    });
    mocks.prisma.user.update.mockResolvedValue({
      id: "user-1",
      name: "Athlete One",
      age: 26,
      position: "MID",
      competitionLevel: "academy",
      gender: "female",
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
    });

    const response = await ProfilePatch(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...minorProfilePayload, age: 26 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalled();
  });
});

describe("POST /api/privacy/delete — password validation", () => {
  beforeEach(() => {
    mocks.prisma.user.findUnique.mockReset();
    mocks.bcryptCompare.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.rateLimit.mockReset();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
  });

  it("rejects deletion with wrong password", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
    });
    mocks.bcryptCompare.mockResolvedValue(false);

    const response = await PrivacyDeletePost(
      jsonRequest("http://localhost/api/privacy/delete", { password: "wrong" }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/password confirmation failed/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
