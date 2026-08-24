import { afterEach, describe, expect, it } from "vitest";

import { isMetricsTokenAuthorized, renderPrometheusMetrics } from "@/lib/observability";

afterEach(() => {
  delete process.env.METRICS_TOKEN;
});

describe("production observability", () => {
  it("renders bounded queue and worker gauges in Prometheus text format", () => {
    const rendered = renderPrometheusMetrics({
      queue: {
        queued: 12,
        retrying: 2,
        processing: 4,
        deadLettered: 1,
        oldestReadyLagSeconds: 75,
      },
      workers: {
        activeCount: 3,
        staleCount: 1,
        processedTotal: 175,
        errorTotal: 7,
        workers: [
          { health: "ACTIVE", processedTotal: 0, errorTotal: 0 },
          { health: "STOPPED", processedTotal: 0, errorTotal: 0 },
        ],
      },
    });

    expect(rendered).toContain('athlemetry_queue_jobs{status="queued"} 12');
    expect(rendered).toContain("athlemetry_queue_oldest_ready_age_seconds 75");
    expect(rendered).toContain('athlemetry_workers{health="active"} 3');
    expect(rendered).toContain('athlemetry_workers{health="stale"} 1');
    expect(rendered).toContain('athlemetry_workers{health="stopped"} 1');
    expect(rendered).toContain("athlemetry_worker_jobs_processed_total 175");
    expect(rendered).toContain("athlemetry_worker_errors_total 7");
    expect(rendered).not.toContain("NaN");
  });

  it("requires a configured constant-time bearer token", () => {
    process.env.METRICS_TOKEN = "metrics-token-that-is-at-least-32-characters";
    expect(isMetricsTokenAuthorized("Bearer metrics-token-that-is-at-least-32-characters")).toBe(true);
    expect(isMetricsTokenAuthorized("Bearer wrong")).toBe(false);
    expect(isMetricsTokenAuthorized(null)).toBe(false);
    delete process.env.METRICS_TOKEN;
    expect(isMetricsTokenAuthorized("Bearer metrics-token-that-is-at-least-32-characters")).toBe(false);
  });
});