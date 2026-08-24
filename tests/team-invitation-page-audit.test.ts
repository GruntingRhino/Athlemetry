import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

describe("team invitations page audit boundary", () => {
  it("loads recipient-scoped pending invitations and writes the minimal audit event in one transaction", async () => {
    const source = await readFile(path.join(root, "src/app/team-invitations/page.tsx"), "utf8");

    expect(source).toContain("prisma.$transaction(async (transaction)");
    expect(source).toContain("recipientId: user.id");
    expect(source).toContain('action: "TEAM_INVITATIONS_VIEWED", actorUserId: user.id');
    expect(source).toContain('category: "SECURITY_AUDIT"');
    expect(source).not.toContain("email: true");
    expect(source).not.toContain("submissions:");
  });
});