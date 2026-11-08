import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

const { GET } = await import("@/app/api/health/route");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports ok with latency when the database answers", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.latencyMs).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });

  it("fails closed with a controlled 503 when the database is unreachable", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED postgresql://app:hunter2@db.internal:5432/athlemetry"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("never leaks connection details in the response or logs when the database fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED postgresql://app:hunter2@db.internal:5432/athlemetry"));

    const response = await GET();
    const text = await response.text();

    expect(text).not.toMatch(/hunter2|postgresql|db\.internal|ECONNREFUSED/);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/hunter2|postgresql|db\.internal/);
  });

  it("marks failure responses as non-cacheable so a load balancer never serves a stale verdict", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("down"));

    const response = await GET();

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
