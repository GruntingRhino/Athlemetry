export type WorkerConfig = {
  batchSize: number;
  pollMs: number;
  once: boolean;
};

type WorkerEnvironment = Record<string, string | undefined>;

type BatchResult = { total: number };

type WorkerLoopDependencies = {
  config: WorkerConfig;
  runBatch: (limit: number) => Promise<BatchResult>;
  sleep: (milliseconds: number) => Promise<void>;
  shouldStop: () => boolean;
  onError?: (error: unknown) => void | Promise<void>;
};

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function parseWorkerConfig(environment: WorkerEnvironment): WorkerConfig {
  return {
    batchSize: boundedInteger(environment.WORKER_BATCH_SIZE, 10, 1, 100),
    pollMs: boundedInteger(environment.WORKER_POLL_MS, 5_000, 250, 60_000),
    once: environment.WORKER_ONCE === "true",
  };
}

export async function runWorkerLoop(dependencies: WorkerLoopDependencies) {
  let errorBackoffMs = dependencies.config.pollMs;

  while (!dependencies.shouldStop()) {
    try {
      await dependencies.runBatch(dependencies.config.batchSize);
      errorBackoffMs = dependencies.config.pollMs;
      if (dependencies.config.once) return;
      await dependencies.sleep(dependencies.config.pollMs);
    } catch (error) {
      await dependencies.onError?.(error);
      if (dependencies.config.once) throw error;
      errorBackoffMs = Math.min(60_000, Math.max(dependencies.config.pollMs, errorBackoffMs * 2));
      await dependencies.sleep(errorBackoffMs);
    }
  }
}
