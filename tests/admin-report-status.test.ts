import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    userReport: { update: vi.fn() },
    userReportStatusEvent: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "admin-1", role: "ADMIN" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { PATCH } = await import("@/app/api/admin/reports/[id]/route");

function request(payload: unknown) {
  return new Request("http://localhost/api/admin/reports/report-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const context = { params: Promise.resolve({ id: "report-1" }) };

describe("admin report resolution history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.userReport.update.mockResolvedValue({ id: "report-1", status: "RESOLVED" });
    mocks.prisma.userReportStatusEvent.create.mockResolvedValue({ id: "event-1" });
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(async (operation) => operation(mocks.prisma));
  });

  it("rejects arbitrary status values without touching the report", async () => {
    const response = await PATCH(request({ status: "DELETE_EVERYTHING" }), context);

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires an explanation before resolving or dismissing a report", async () => {
    const response = await PATCH(request({ status: "RESOLVED" }), context);

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects contact details and external links in an athlete-visible resolution note", async () => {
    const response = await PATCH(request({
      status: "RESOLVED",
      resolutionNote: "Contact reviewer@example.com or visit https://example.com for details.",
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("warns administrators before entering an athlete-visible resolution note", () => {
    const form = readFileSync("src/components/forms/report-review-form.tsx", "utf8");

    expect(form).toContain("Do not include contact details or external links.");
    expect(form).toContain("Resolution notes are visible to the report owner.");
  });

  it("atomically updates status and appends immutable review and security-audit events", async () => {
    const response = await PATCH(request({ status: "RESOLVED", resolutionNote: "Corrected result is available after reprocessing." }), context);

    expect(response.status).toBe(200);
    expect(mocks.prisma.userReport.update).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: {
        status: "RESOLVED",
        reviewedAt: expect.any(Date),
        reviewedById: "admin-1",
      },
    });
    expect(mocks.prisma.userReportStatusEvent.create).toHaveBeenCalledWith({
      data: {
        reportId: "report-1",
        actorUserId: "admin-1",
        status: "RESOLVED",
        resolutionNote: "Corrected result is available after reprocessing.",
      },
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission report review status updated",
        metadata: {
          action: "SUBMISSION_REPORT_STATUS_UPDATED",
          actorUserId: "admin-1",
          reportId: "report-1",
          status: "RESOLVED",
        },
      },
    });
  });

  it("fails closed when the security audit cannot be written", async () => {
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await PATCH(request({ status: "IN_REVIEW" }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Report status could not be updated safely." });
  });

  it("returns not found when the report disappears", async () => {
    mocks.prisma.userReport.update.mockRejectedValue(Object.assign(new Error("Record not found"), { code: "P2025" }));

    const response = await PATCH(request({ status: "IN_REVIEW" }), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Report not found." });
  });
});
