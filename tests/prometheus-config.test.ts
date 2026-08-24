import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production Prometheus configuration", () => {
  it("scrapes authenticated metrics without embedding the bearer secret", () => {
    const config = readFileSync("ops/prometheus/prometheus.yml", "utf8");
    expect(config).toContain("web:3000");
    expect(config).toContain("/api/metrics");
    expect(config).toContain("credentials_file: /run/secrets/metrics_token");
    expect(config).not.toMatch(/credentials:\s+\S+/);
  });

  it("alerts on unavailable metrics, stalled fleet capacity, stale workers, and poison jobs", () => {
    const rules = readFileSync("ops/prometheus/alerts.yml", "utf8");
    expect(rules).toContain("AthlemetryMetricsUnavailable");
    expect(rules).toContain("AthlemetryQueuedWithoutActiveWorkers");
    expect(rules).toContain("AthlemetryStaleWorker");
    expect(rules).toContain("AthlemetryDeadLetteredSubmission");
    expect(rules).toContain('athlemetry_workers{health="active"}');
    expect(rules).toContain('athlemetry_queue_jobs{status="dead_lettered"}');
    expect(rules).not.toMatch(/athlete|submissionId|email/);
  });
});