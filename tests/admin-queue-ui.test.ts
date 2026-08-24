import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("admin queue operations UI", () => {
  it("exposes queue lag, dead-letter failures, and controlled requeue actions", () => {
    const page = readFileSync("src/app/admin/page.tsx", "utf8");
    const panel = readFileSync("src/components/admin/queue-operations-panel.tsx", "utf8");

    expect(page).toContain("getQueueOperationsSnapshot");
    expect(page).toContain("getWorkerHealth");
    expect(page).toContain("QueueOperationsPanel");
    expect(panel).toContain("Oldest ready job");
    expect(panel).toContain("Dead-letter queue");
    expect(panel).toContain("Active workers");
    expect(panel).toContain("Stale workers");
    expect(panel).toContain("/api/admin/processing/dead-letter/");
  });
});