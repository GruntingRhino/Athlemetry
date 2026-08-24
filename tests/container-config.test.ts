import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production container configuration", () => {
  it("builds distinct web and CV worker runtime targets", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("AS web");
    expect(dockerfile).toContain("AS worker");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain("USER worker");
    expect(dockerfile).toContain("worker-entrypoint.sh");
    expect(dockerfile).toContain("/app/node_modules/@img");
  });

  it("uses Next standalone output and excludes private development artifacts", () => {
    expect(readFileSync("next.config.ts", "utf8")).toContain('output: "standalone"');
    const ignore = readFileSync(".dockerignore", "utf8");
    expect(ignore).toContain(".env*");
    expect(ignore).toContain("test-media");
    expect(ignore).toContain("*.pt");
  });

  it("builds both production images in CI and fails workers closed when model artifacts are absent", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("docker build --target web");
    expect(workflow).toContain("docker build --target worker");

    const entrypoint = readFileSync("scripts/worker-entrypoint.sh", "utf8");
    expect(entrypoint).toContain("VISION_PERSON_MODEL");
    expect(entrypoint).toContain("VISION_POSE_MODEL");
    expect(entrypoint).toContain("VISION_OBJECT_MODEL");
    expect(entrypoint).toContain("VISION_REID_MODEL");
    expect(entrypoint.match(/verify_model/g)).toHaveLength(5); // definition plus all four model checks
    expect(entrypoint).toContain("SHA256");
    expect(entrypoint).toContain('hasattr(cv2, "aruco")');

    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("VISION_PERSON_MODEL_SHA256=");
    expect(dockerfile).toContain("VISION_POSE_MODEL_SHA256=");
    expect(dockerfile).toContain("VISION_OBJECT_MODEL_SHA256=");
    expect(dockerfile).toContain("VISION_REID_MODEL_SHA256=");
    expect(entrypoint).toContain("exec npm run worker");
  });

  it("pins patched production image-processing dependencies", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      overrides?: Record<string, string>;
    };
    expect(packageJson.overrides?.postcss).toBe("8.5.23");
    expect(packageJson.overrides?.sharp).toBe("0.35.3");
  });

  it("passes the configured learned re-identification model to vision analysis", () => {
    const adapter = readFileSync("src/lib/vision-analysis.ts", "utf8");
    expect(adapter).toContain("VISION_REID_MODEL");
    expect(adapter).toContain('args.push("--reid-model", reidModel)');
  });

  it("exposes printable planar calibration markers from the protocol page", () => {
    const page = readFileSync("src/app/protocols/page.tsx", "utf8");
    for (const markerId of [10, 11, 12, 13]) {
      expect(page).toContain(`/protocols/aruco-planar-id-${markerId}.png`);
    }
  });

  it("requires the professional capability report in the admin validation workflow", () => {
    const panel = readFileSync("src/components/forms/metric-validation-panel.tsx", "utf8");
    expect(panel).toContain('name="capabilityEvidence"');
    expect(panel).toContain("JSON.parse(capabilityEvidenceRaw)");
    expect(panel).toContain("capabilityEvidence,");
  });
});