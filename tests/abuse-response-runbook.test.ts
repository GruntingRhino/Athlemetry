import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("abuse-response runbook", () => {
  it("defines minimum-data triage, containment limits, and escalation without claiming unavailable controls", async () => {
    const runbook = await readFile(path.join(root, "docs/abuse-response.md"), "utf8");

    expect(runbook).toContain("P0");
    expect(runbook).toContain("P1");
    expect(runbook).toContain("P2");
    expect(runbook).toContain("P3");
    expect(runbook).toContain("Do not include passwords, session tokens");
    expect(runbook).toContain("`SECURITY_AUDIT`");
    expect(runbook).toContain("CONTAINMENT_UNAVAILABLE");
    expect(runbook).toContain("account suspension and bulk invite revocation are not implemented controls");
    expect(runbook).toContain("does not provide self-service reset delivery");
    expect(runbook).toContain("legal/privacy leadership");
    expect(runbook).toContain("This runbook does not close the privacy, safety, moderation");
  });
});
