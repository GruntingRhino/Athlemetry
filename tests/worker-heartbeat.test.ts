import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workerHeartbeat: {
      upsert: mocks.upsert,
      update: mocks.update,
      findMany: mocks.findMany,
      aggregate: mocks.aggregate,
    },
  },
}));

const {
  getWorkerHealth,
  recordWorkerBatch,
  recordWorkerError,
  recordWorkerStarted,
  recordWorkerStopped,
} = await import("@/lib/processing/worker-heartbeat");

describe("processing worker heartbeats", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.update.mockReset();
    mocks.findMany.mockReset();
    mocks.aggregate.mockReset();
    mocks.aggregate.mockResolvedValue({ _sum: { processedTotal: 0, errorTotal: 0 } });
  });

  it("wires lifecycle heartbeats into the standalone worker executable", () => {
    const source = readFileSync("scripts/processing-worker.ts", "utf8");
    expect(source).toContain("recordWorkerStarted");
    expect(source).toContain("recordWorkerBatch");
    expect(source).toContain("recordWorkerError");
    expect(source).toContain("recordWorkerStopped");
  });

  it("registers a worker and persists batch throughput counters", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    await recordWorkerStarted("worker-1", now);
    await recordWorkerBatch("worker-1", { completed: 7, failed: 2 }, now);

    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { workerId: "worker-1" },
      create: expect.objectContaining({ workerId: "worker-1", status: "RUNNING", processedTotal: 0, errorTotal: 0 }),
      update: { status: "RUNNING", startedAt: now, lastSeenAt: now },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { workerId: "worker-1" },
      data: {
        status: "RUNNING",
        lastSeenAt: now,
        processedTotal: { increment: 9 },
        errorTotal: { increment: 2 },
      },
    });
  });

  it("keeps a failed polling worker visible while incrementing its error counter", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    await recordWorkerError("worker-1", now);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { workerId: "worker-1" },
      data: {
        status: "RUNNING",
        lastSeenAt: now,
        errorTotal: { increment: 1 },
      },
    });
  });

  it("classifies stale workers and records graceful shutdown", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    mocks.findMany.mockResolvedValue([
      { workerId: "active", status: "RUNNING", lastSeenAt: new Date("2026-07-27T11:59:50.000Z") },
      { workerId: "stale", status: "RUNNING", lastSeenAt: new Date("2026-07-27T11:58:00.000Z") },
      { workerId: "stopped", status: "STOPPED", lastSeenAt: new Date("2026-07-27T11:59:59.000Z") },
    ]);
    mocks.aggregate.mockResolvedValue({ _sum: { processedTotal: 12, errorTotal: 3 } });

    await expect(getWorkerHealth(now, 30_000)).resolves.toEqual(expect.objectContaining({
      activeCount: 1,
      staleCount: 1,
      processedTotal: 12,
      errorTotal: 3,
      workers: expect.arrayContaining([
        expect.objectContaining({ workerId: "active", health: "ACTIVE" }),
        expect.objectContaining({ workerId: "stale", health: "STALE" }),
        expect.objectContaining({ workerId: "stopped", health: "STOPPED" }),
      ]),
    }));

    await recordWorkerStopped("active", now);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { workerId: "active" },
      data: { status: "STOPPED", lastSeenAt: now },
    });
  });

  it("does not mark a healthy worker stale between maximum polling intervals", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    mocks.findMany.mockResolvedValue([
      { workerId: "slow-poller", status: "RUNNING", lastSeenAt: new Date("2026-07-27T11:59:00.000Z") },
    ]);

    await expect(getWorkerHealth(now)).resolves.toEqual(expect.objectContaining({
      activeCount: 1,
      staleCount: 0,
    }));
  });
});