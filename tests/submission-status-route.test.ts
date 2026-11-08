import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; role: string } } | null,
  findFirst: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { drillSubmission: { findFirst: mocks.findFirst } } }));

const { GET } = await import("@/app/api/submissions/[id]/status/route");

const params = { params: Promise.resolve({ id: "submission-1" }) };
const call = () => GET(new Request("http://localhost/api/submissions/submission-1/status"), params);

describe("GET /api/submissions/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.findFirst.mockResolvedValue({ processingStatus: "PROCESSING" });
  });

  it("requires a session before touching the database", async () => {
    mocks.session = null;
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns only the processing status, uncached", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processingStatus: "PROCESSING" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("scopes the lookup to the signed-in athlete", async () => {
    await call();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "submission-1", athleteId: "athlete-1" },
      select: { processingStatus: true },
    });
  });

  it("lets an admin look up any submission", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    await call();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "submission-1" },
      select: { processingStatus: true },
    });
  });

  it("answers 404 without saying whether someone else's submission exists", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Submission not found." });
  });

  it("fails with a controlled 503 and no database detail", async () => {
    mocks.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:pw@host/db"));
    const response = await call();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/postgres|ECONNREFUSED|pw/);
  });
});
