import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Alertmanager delivery configuration", () => {
  it("routes Prometheus alerts to the Alertmanager service", () => {
    const prometheus = readFileSync("ops/prometheus/prometheus.yml", "utf8");
    expect(prometheus).toContain("alerting:");
    expect(prometheus).toContain("alertmanager:9093");
  });

  it("loads the operator webhook from a mounted secret and sends resolutions", () => {
    const config = readFileSync("ops/alertmanager/alertmanager.yml", "utf8");
    expect(config).toContain("receiver: athlemetry-operator");
    expect(config).toContain("url_file: /run/secrets/alertmanager_webhook_url");
    expect(config).toContain("send_resolved: true");
    expect(config).toContain("severity=\"critical\"");
    expect(config).toContain("repeat_interval: 30m");
    expect(config).not.toMatch(/https?:\/\//);
    expect(config).not.toMatch(/submissionId|athleteId|email/);
  });
});
