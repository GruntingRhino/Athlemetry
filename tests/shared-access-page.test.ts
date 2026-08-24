import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "recipient-1" },
  findMany: vi.fn(),
  readSharedSubmission: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/lib/authz", () => ({ requireUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { submissionShare: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/submission-sharing", () => ({
  readSharedSubmissionForRecipient: mocks.readSharedSubmission,
}));

const { default: SharedAccessPage } = await import("@/app/shared/page");

describe("shared access page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      {
        submission: {
          id: "submission-1",
          recordingDate: new Date("2026-07-30T00:00:00.000Z"),
          drillDefinition: { name: "20m Sprint", sport: "soccer" },
        },
      },
    ]);
    mocks.readSharedSubmission.mockResolvedValue(null);
  });

  it("discovers only the recipient's active submissions without exposing an owner identity", async () => {
    const html = renderToStaticMarkup(await SharedAccessPage({}));

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { recipientId: "recipient-1", active: true },
      select: {
        submission: {
          select: {
            id: true,
            recordingDate: true,
            drillDefinition: { select: { name: true, sport: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    expect(html).toContain("Shared with you");
    expect(html).toContain("20m Sprint");
    expect(html).toContain("/shared?submission=submission-1");
    expect(html).not.toContain("owner-1");
  });

  it("uses the recipient-scoped audited reader for a selected submission", async () => {
    mocks.readSharedSubmission.mockResolvedValue({
      id: "submission-1",
      drillType: "sprint-20m",
      recordingDate: new Date("2026-07-30T00:00:00.000Z"),
      submittedAt: new Date("2026-07-30T00:00:00.000Z"),
      processingStatus: "COMPLETED",
      drillDefinition: { name: "20m Sprint", sport: "soccer" },
      userReports: [],
    });

    const html = renderToStaticMarkup(await SharedAccessPage({ searchParams: { submission: "submission-1" } }));

    expect(mocks.readSharedSubmission).toHaveBeenCalledWith("recipient-1", "submission-1");
    expect(html).toContain("Shared submission details");
    expect(html).toContain("COMPLETED");
  });
});
