import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("synthetic mixed-sport media generator", () => {
  it("creates three decodable clips when optional drawtext is unavailable", () => {
    const output = mkdtempSync(path.join(os.tmpdir(), "athlemetry-media-test-"));
    try {
      execFileSync("bash", ["scripts/generate-synthetic-media-fixtures.sh", output], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
      for (const name of [
        "soccer-side-sprint.mp4",
        "baseball-behind-pitcher.mp4",
        "basketball-open-side-shot.mp4",
      ]) {
        const file = path.join(output, name);
        expect(statSync(file).size).toBeGreaterThan(1000);
        const duration = Number(execFileSync("ffprobe", [
          "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
        ], { encoding: "utf8" }).trim());
        expect(duration).toBeGreaterThan(0);
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 30_000);
});
