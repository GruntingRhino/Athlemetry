import { hostname } from "node:os";

import { processBenchmarkRebuildJobs } from "@/lib/benchmark-rebuild";
import { prisma } from "@/lib/prisma";
import { runProcessingBatch } from "@/lib/processing/queue";
import { parseWorkerConfig, runWorkerLoop } from "@/lib/processing/worker";
import {
  recordWorkerBatch,
  recordWorkerError,
  recordWorkerStarted,
  recordWorkerStopped,
} from "@/lib/processing/worker-heartbeat";

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const config = parseWorkerConfig(process.env);
  const workerId = process.env.WORKER_ID?.trim() || `${hostname()}-${process.pid}`;
  await recordWorkerStarted(workerId);
  console.log(JSON.stringify({ level: "info", event: "worker-started", workerId, ...config }));

  try {
    await runWorkerLoop({
      config,
      shouldStop: () => stopping,
      sleep,
      runBatch: async (limit) => {
        const result = await runProcessingBatch(limit);
        const benchmarkRebuilds = await processBenchmarkRebuildJobs(prisma, undefined, 2);
        await recordWorkerBatch(workerId, result);
        console.log(JSON.stringify({
          level: "info",
          event: "worker-batch",
          workerId,
          ...result,
          benchmarkRebuilds,
          results: undefined,
        }));
        return result;
      },
      onError: async (error) => {
        try {
          await recordWorkerError(workerId);
        } catch (heartbeatError) {
          console.error(JSON.stringify({
            level: "error",
            event: "worker-heartbeat-failed",
            workerId,
            message: heartbeatError instanceof Error ? heartbeatError.message : "Unknown heartbeat failure",
          }));
        }
        console.error(JSON.stringify({
          level: "error",
          event: "worker-batch-failed",
          workerId,
          message: error instanceof Error ? error.message : "Unknown worker failure",
        }));
      },
    });
  } finally {
    try {
      await recordWorkerStopped(workerId);
    } catch (heartbeatError) {
      console.error(JSON.stringify({
        level: "error",
        event: "worker-heartbeat-failed",
        workerId,
        message: heartbeatError instanceof Error ? heartbeatError.message : "Unknown heartbeat failure",
      }));
    } finally {
      await prisma.$disconnect();
    }
    console.log(JSON.stringify({ level: "info", event: "worker-stopped", workerId }));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    level: "fatal",
    event: "worker-crashed",
    message: error instanceof Error ? error.message : "Unknown worker crash",
  }));
  process.exitCode = 1;
});
