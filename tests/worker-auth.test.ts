import { afterEach, describe, expect, it } from "vitest";

import { isWorkerTokenAuthorized } from "@/lib/worker-auth";

describe("processing worker authentication", () => {
  afterEach(() => delete process.env.PROCESSING_WORKER_TOKEN);

  it("accepts only the configured bearer token and fails closed when unconfigured", () => {
    expect(isWorkerTokenAuthorized("Bearer anything")).toBe(false);
    process.env.PROCESSING_WORKER_TOKEN = "worker-secret-that-is-at-least-32-chars";
    expect(isWorkerTokenAuthorized("Bearer worker-secret-that-is-at-least-32-chars")).toBe(true);
    expect(isWorkerTokenAuthorized("Bearer wrong-secret")).toBe(false);
    expect(isWorkerTokenAuthorized(null)).toBe(false);
  });

  it("rejects configured worker credentials shorter than 32 characters", () => {
    process.env.PROCESSING_WORKER_TOKEN = "worker-secret";
    expect(isWorkerTokenAuthorized("Bearer worker-secret")).toBe(false);
  });
});