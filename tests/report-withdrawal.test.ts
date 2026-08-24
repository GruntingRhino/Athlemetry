import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", role: "ATHLETE" } } as { user: { id: string; role: string } } | null,
  prisma: {
    userReport: { findFirst: vi.fn(), updateMany: vi.fn() },
    userReportStatusEvent: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/reports/[id]/withdraw/route");
const context = { params: Promise.resolve({ id: "report-1" }) };

describe("POST /api/reports/[id]/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.prisma.userReport.findFirst.mockResolvedValue({ id: "report-1", status: "OPEN" });
    mocks.prisma.userReport.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.userReportStatusEvent.create.mockResolvedValue({ id: "event-1" });
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(async (operation) => operation(mocks.prisma));
  });

  it("rejects anonymous withdrawal without looking up a report", async () => {
    mocks.session = null;

    const response = await POST(new Request("http://localhost/api/reports/report-1/withdraw", { method: "POST" }), context);

    expect(response.status).toBe(401);
    expect(mocks.prisma.userReport.findFirst).not.toHaveBeenCalled();
  });

  it("does not disclose or update another athlete's report", async () => {
    mocks.prisma.userReport.findFirst.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/reports/report-1/withdraw", { method: "POST" }), context);

    expect(response.status).toBe(404);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows withdrawal only while the athlete's report is open", async () => {
    mocks.prisma.userReport.findFirst.mockResolvedValue({ id: "report-1", status: "IN_REVIEW" });

    const response = await POST(new Request("http://localhost/api/reports/report-1/withdraw", { method: "POST" }), context);

    expect(response.status).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("atomically dismisses the open report and records immutable history plus a minimal audit event", async () => {
    const response = await POST(new Request("http://localhost/api/reports/report-1/withdraw", { method: "POST" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prisma.userReport.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", reporterId: "athlete-1", status: "OPEN" },
      data: { status: "DISMISSED", reviewedAt: expect.any(Date), reviewedById: null },
    });
    expect(mocks.prisma.userReportStatusEvent.create).toHaveBeenCalledWith({
      data: {
        reportId: "report-1",
        actorUserId: "athlete-1",
        status: "DISMISSED",
        resolutionNote: "Withdrawn by reporter.",
      },
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission report withdrawn",
        metadata: { action: "SUBMISSION_REPORT_WITHDRAWN", actorUserId: "athlete-1", reportId: "report-1" },
      },
    });
  });

  it("fails closed when the transaction cannot write the audit event", async () => {
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/reports/report-1/withdraw", { method: "POST" }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Report could not be withdrawn safely." });
  });
});
