import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string } },
  purge: vi.fn(),
  workerAuthorized: vi.fn(),
  systemLogCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/worker-auth", () => ({ isWorkerTokenAuthorized: mocks.workerAuthorized }));
vi.mock("@/lib/prisma", () => ({ prisma: { systemLog: { create: mocks.systemLogCreate } } }));
vi.mock("@/lib/distributed-rate-limit", async (importOriginal) => ({
  ...(await importOriginal()),
  purgeStaleRateLimits: mocks.purge,
}));

const { purgeStaleRateLimits } = await vi.importActual<typeof import("@/lib/distributed-rate-limit")>(
  "@/lib/distributed-rate-limit",
);
const { POST } = await import("@/app/api/admin/rate-limits/purge-expired/route");

describe("rate-limit retention cleanup", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.purge.mockReset();
    mocks.workerAuthorized.mockReset();
    mocks.workerAuthorized.mockReturnValue(false);
    mocks.purge.mockResolvedValue(4);
    mocks.systemLogCreate.mockReset();
    mocks.systemLogCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("deletes a bounded batch using a server-owned retention cutoff", async () => {
    let statement: unknown;
    const client = { $executeRaw: vi.fn(async (query: unknown) => { statement = query; return 4; }) };
    await expect(purgeStaleRateLimits({
      now: new Date("2026-07-27T12:00:00Z"),
      retentionMs: 86_400_000,
      batchSize: 500,
      client,
    })).resolves.toBe(4);
    expect(JSON.stringify(statement)).toContain("2026-07-26T12:00:00.000Z");
    expect(JSON.stringify(statement)).toContain("500");
  });

  it("rejects unauthenticated cleanup", async () => {
    const response = await POST(new Request("http://localhost/api/admin/rate-limits/purge-expired", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it("allows the worker credential and returns the deleted count", async () => {
    mocks.workerAuthorized.mockReturnValue(true);
    const response = await POST(new Request("http://localhost/api/admin/rate-limits/purge-expired", {
      method: "POST",
      headers: { authorization: "Bearer fixture" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 4 });
    expect(mocks.systemLogCreate).not.toHaveBeenCalled();
  });

  it("audits an administrator before deleting rate-limit windows", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };

    const response = await POST(new Request("http://localhost/api/admin/rate-limits/purge-expired", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 4 });
    expect(mocks.systemLogCreate).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Expired rate-limit windows purge initiated",
        metadata: { action: "RATE_LIMIT_WINDOWS_PURGE_INITIATED", actorUserId: "admin-1" },
      },
    });
    expect(mocks.systemLogCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.purge.mock.invocationCallOrder[0],
    );
  });

  it("fails closed without deleting rate-limit windows when the administrator audit cannot be written", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.systemLogCreate.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/admin/rate-limits/purge-expired", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Rate-limit cleanup could not be initiated safely." });
    expect(mocks.purge).not.toHaveBeenCalled();
  });
});
