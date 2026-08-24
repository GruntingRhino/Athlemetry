import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { parseWorkerConfig, runWorkerLoop } from "@/lib/processing/worker";

describe("processing worker", () => {
  it("exposes long-running and one-shot worker commands", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts.worker).toBe("tsx scripts/processing-worker.ts");
    expect(packageJson.scripts["worker:once"]).toBe("WORKER_ONCE=true tsx scripts/processing-worker.ts");
  });

  it("bounds batch and polling configuration", () => {
    expect(parseWorkerConfig({ WORKER_BATCH_SIZE: "500", WORKER_POLL_MS: "50", WORKER_ONCE: "true" })).toEqual({
      batchSize: 100,
      pollMs: 250,
      once: true,
    });
  });

  it("runs exactly one batch in one-shot mode", async () => {
    const runBatch = vi.fn().mockResolvedValue({ total: 0 });
    const sleep = vi.fn();
    await runWorkerLoop({ config: { batchSize: 5, pollMs: 1000, once: true }, runBatch, sleep, shouldStop: () => false });
    expect(runBatch).toHaveBeenCalledOnce();
    expect(runBatch).toHaveBeenCalledWith(5);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("backs off after a transient batch failure and resumes", async () => {
    const runBatch = vi.fn()
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockResolvedValueOnce({ total: 0 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    let checks = 0;
    await runWorkerLoop({
      config: { batchSize: 5, pollMs: 1000, once: false },
      runBatch,
      sleep,
      shouldStop: () => ++checks > 2,
    });
    expect(runBatch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it("waits for asynchronous error persistence before continuing", async () => {
    let errorRecorded = false;
    await expect(runWorkerLoop({
      config: { batchSize: 1, pollMs: 1000, once: true },
      runBatch: vi.fn().mockRejectedValue(new Error("database unavailable")),
      sleep: vi.fn(),
      shouldStop: () => false,
      onError: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        errorRecorded = true;
      },
    })).rejects.toThrow("database unavailable");
    expect(errorRecorded).toBe(true);
  });
});