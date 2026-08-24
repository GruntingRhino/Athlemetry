import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: false,
  collect: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({
  isMetricsTokenAuthorized: vi.fn(() => mocks.authorized),
  collectPrometheusMetrics: mocks.collect,
}));

const { GET } = await import("@/app/api/metrics/route");

describe("GET /api/metrics", () => {
  beforeEach(() => {
    mocks.authorized = false;
    mocks.collect.mockReset();
  });

  it("does not expose operational data without scraper authentication", async () => {
    const response = await GET(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("returns non-cacheable Prometheus text to an authorized scraper", async () => {
    mocks.authorized = true;
    mocks.collect.mockResolvedValue("athlemetry_queue_jobs 4\n");
    const response = await GET(new Request("http://localhost/api/metrics", {
      headers: { authorization: "Bearer configured-token" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("athlemetry_queue_jobs 4\n");
  });
});