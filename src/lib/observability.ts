import { timingSafeEqual } from "node:crypto";

import { getQueueOperationsSnapshot } from "@/lib/processing/queue-operations";
import { getWorkerHealth } from "@/lib/processing/worker-heartbeat";

type ObservabilitySnapshot = {
  queue: {
    queued: number;
    retrying: number;
    processing: number;
    deadLettered: number;
    oldestReadyLagSeconds: number;
  };
  workers: {
    activeCount: number;
    staleCount: number;
    processedTotal: number;
    errorTotal: number;
    workers: Array<{
      health: "ACTIVE" | "STALE" | "STOPPED";
      processedTotal: number;
      errorTotal: number;
    }>;
  };
};

function safeMetricValue(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isMetricsTokenAuthorized(authorizationHeader: string | null) {
  const configured = process.env.METRICS_TOKEN?.trim();
  if (!configured || configured.length < 32 || !authorizationHeader?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(configured);
  const supplied = Buffer.from(authorizationHeader.slice("Bearer ".length));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function renderPrometheusMetrics(snapshot: ObservabilitySnapshot) {
  const stoppedCount = snapshot.workers.workers.filter((worker) => worker.health === "STOPPED").length;
  const processedTotal = safeMetricValue(snapshot.workers.processedTotal);
  const errorTotal = safeMetricValue(snapshot.workers.errorTotal);
  return [
    "# HELP athlemetry_queue_jobs Current processing jobs by state.",
    "# TYPE athlemetry_queue_jobs gauge",
    `athlemetry_queue_jobs{status="queued"} ${safeMetricValue(snapshot.queue.queued)}`,
    `athlemetry_queue_jobs{status="retrying"} ${safeMetricValue(snapshot.queue.retrying)}`,
    `athlemetry_queue_jobs{status="processing"} ${safeMetricValue(snapshot.queue.processing)}`,
    `athlemetry_queue_jobs{status="dead_lettered"} ${safeMetricValue(snapshot.queue.deadLettered)}`,
    "# HELP athlemetry_queue_oldest_ready_age_seconds Age of the oldest processable job.",
    "# TYPE athlemetry_queue_oldest_ready_age_seconds gauge",
    `athlemetry_queue_oldest_ready_age_seconds ${safeMetricValue(snapshot.queue.oldestReadyLagSeconds)}`,
    "# HELP athlemetry_workers Persisted worker instances by health state.",
    "# TYPE athlemetry_workers gauge",
    `athlemetry_workers{health="active"} ${safeMetricValue(snapshot.workers.activeCount)}`,
    `athlemetry_workers{health="stale"} ${safeMetricValue(snapshot.workers.staleCount)}`,
    `athlemetry_workers{health="stopped"} ${stoppedCount}`,
    "# HELP athlemetry_worker_jobs_processed_total Jobs processed by recorded worker instances.",
    "# TYPE athlemetry_worker_jobs_processed_total counter",
    `athlemetry_worker_jobs_processed_total ${processedTotal}`,
    "# HELP athlemetry_worker_errors_total Errors recorded by worker instances.",
    "# TYPE athlemetry_worker_errors_total counter",
    `athlemetry_worker_errors_total ${errorTotal}`,
    "",
  ].join("\n");
}

export async function collectPrometheusMetrics() {
  const [queue, workers] = await Promise.all([
    getQueueOperationsSnapshot(),
    getWorkerHealth(),
  ]);
  return renderPrometheusMetrics({ queue, workers });
}
