import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { enqueueBenchmarkRebuilds, processBenchmarkRebuildJobs } from "@/lib/benchmark-rebuild";

describe("benchmark rebuild queue", () => {
  it("deduplicates affected cohorts and resets them to pending", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    await enqueueBenchmarkRebuilds({ benchmarkRebuildJob: { upsert } } as never, [
      { cohortKey: "soccer|20-21|MID|academy|female", drillDefinitionId: "drill-1", metricName: "sprintTime" },
      { cohortKey: "soccer|20-21|MID|academy|female", drillDefinitionId: "drill-1", metricName: "sprintTime" },
    ]);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        cohortKey_drillDefinitionId_metricName: {
          cohortKey: "soccer|20-21|MID|academy|female",
          drillDefinitionId: "drill-1",
          metricName: "sprintTime",
        },
      },
      create: {
        cohortKey: "soccer|20-21|MID|academy|female",
        drillDefinitionId: "drill-1",
        metricName: "sprintTime",
      },
      update: {
        status: "PENDING",
        attempts: 0,
        cursorSubmissionId: null,
        lastError: null,
        queuedAt: expect.any(Date),
        claimedAt: null,
        completedAt: null,
      },
    });
  });

  it("persists uniquely keyed rebuild jobs for crash-safe processing", () => {
    const sql = readFileSync(
      "prisma/migrations/20260727223000_benchmark_rebuild_jobs/migration.sql",
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE "BenchmarkRebuildJob"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "BenchmarkRebuildJob_cohortKey_drillDefinitionId_metricName_key"/);
  });

  it("runs rebuild work from the production processing worker", () => {
    const worker = readFileSync("scripts/processing-worker.ts", "utf8");
    expect(worker).toContain("processBenchmarkRebuildJobs");
    expect(worker).toContain("benchmarkRebuilds");
  });

  it("checkpoints bounded pages that do not contain the target cohort", async () => {
    const job = {
      id: "job-1",
      cohortKey: "SOCCER_20M_SPRINT|20-21|MID|academy|female",
      drillDefinitionId: "drill-1",
      metricName: "sprintTime",
      attempts: 0,
      cursorSubmissionId: null,
    };
    const client = {
      benchmarkRebuildJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      drillSubmission: {
        findMany: vi.fn().mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
          id: `submission-${String(index).padStart(3, "0")}`,
          drillType: "BASKETBALL_FREE_THROW",
          athlete: { age: 20, position: "MID", competitionLevel: "academy", gender: "female" },
        }))),
      },
    };
    const recalculate = vi.fn().mockResolvedValue(undefined);

    const result = await processBenchmarkRebuildJobs(client as never, recalculate, 1);

    expect(result).toEqual({ claimed: 1, completed: 0, checkpointed: 1, failed: 0 });
    expect(client.benchmarkRebuildJob.updateMany).toHaveBeenCalledWith({
      where: { status: "PROCESSING", claimedAt: { lt: expect.any(Date) } },
      data: { status: "PENDING", claimedAt: null },
    });
    expect(recalculate).not.toHaveBeenCalled();
    expect(client.benchmarkRebuildJob.update).toHaveBeenLastCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "PENDING",
        cursorSubmissionId: "submission-099",
        claimedAt: null,
      }),
    });
  });

  it("runs one whole-cohort recalculation when a page has many matching athletes", async () => {
    const job = {
      id: "job-1",
      cohortKey: "SOCCER_20M_SPRINT|20-21|MID|academy|female",
      drillDefinitionId: "drill-1",
      metricName: "sprintTime",
      attempts: 0,
      cursorSubmissionId: null,
    };
    const client = {
      benchmarkRebuildJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      drillSubmission: {
        findMany: vi.fn().mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
          id: `submission-${String(index).padStart(3, "0")}`,
          drillType: "SOCCER_20M_SPRINT",
          athlete: { age: 20, position: "MID", competitionLevel: "academy", gender: "female" },
        }))),
      },
    };
    const recalculate = vi.fn().mockResolvedValue(undefined);

    const result = await processBenchmarkRebuildJobs(client as never, recalculate, 1);

    expect(recalculate).toHaveBeenCalledOnce();
    expect(recalculate).toHaveBeenCalledWith("submission-000");
    expect(result).toEqual({ claimed: 1, completed: 1, checkpointed: 0, failed: 0 });
  });

});
