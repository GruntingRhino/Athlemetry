import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const mocks = vi.hoisted(() => ({
  prisma: {
    userReport: { findMany: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { readFeedbackHistoryForOwner } = await import("@/lib/feedback-history");

describe("feedback history boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("selects only the authenticated reporter's reports and excludes reviewer identities", async () => {
    const source = await readFile(path.join(root, "src/app/feedback/page.tsx"), "utf8");

    expect(source).toContain("readFeedbackHistoryForOwner(user.id)");
    expect(source).not.toContain("prisma");
  });

  it("returns feedback history only after recording a minimal owner-attributed audit event in the same transaction", async () => {
    const reports = [{ id: "report-1", statusEvents: [] }];
    mocks.prisma.userReport.findMany.mockResolvedValue(reports);

    await expect(readFeedbackHistoryForOwner("athlete-1")).resolves.toEqual(reports);

    expect(mocks.prisma.userReport.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reporterId: "athlete-1" },
      take: 100,
    }));
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Feedback history viewed",
        metadata: {
          action: "FEEDBACK_HISTORY_VIEWED",
          actorUserId: "athlete-1",
        },
      },
    });
  });

  it("does not return feedback history when the audit write fails", async () => {
    mocks.prisma.userReport.findMany.mockResolvedValue([{ id: "report-1" }]);
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(readFeedbackHistoryForOwner("athlete-1")).rejects.toThrow("audit unavailable");
  });

  it("withholds unsafe legacy resolution notes before they reach the report owner", async () => {
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.userReport.findMany.mockResolvedValue([{
      id: "report-1",
      statusEvents: [
        { status: "RESOLVED", resolutionNote: "Contact reviewer@example.com for details.", createdAt: new Date("2026-07-30T00:00:00.000Z") },
        { status: "IN_REVIEW", resolutionNote: "A reviewer is assessing your report.", createdAt: new Date("2026-07-29T00:00:00.000Z") },
      ],
    }]);

    await expect(readFeedbackHistoryForOwner("athlete-1")).resolves.toEqual([{
      id: "report-1",
      statusEvents: [
        {
          status: "RESOLVED",
          resolutionNote: null,
          resolutionNoteWasWithheld: true,
          createdAt: new Date("2026-07-30T00:00:00.000Z"),
        },
        {
          status: "IN_REVIEW",
          resolutionNote: "A reviewer is assessing your report.",
          resolutionNoteWasWithheld: false,
          createdAt: new Date("2026-07-29T00:00:00.000Z"),
        },
      ],
    }]);
  });

  it("keeps the report projection limited to owner-visible status history without reviewer identities", async () => {
    const source = await readFile(path.join(root, "src/lib/feedback-history.ts"), "utf8");
    const page = await readFile(path.join(root, "src/app/feedback/page.tsx"), "utf8");

    expect(source).toContain("where: { reporterId }");
    expect(source).toContain("requestType: true");
    expect(source).toContain("statusEvents:");
    expect(source).toContain("resolutionNote: true");
    expect(source).toContain("resolutionNoteWasWithheld");
    expect(source).not.toContain("reviewedBy");
    expect(source).not.toContain("actor:");
    expect(page).toContain("resolutionNoteWasWithheld");
    expect(page).toContain("legacy resolution note was withheld");
  });
});
