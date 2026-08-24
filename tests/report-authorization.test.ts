import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDatabaseRateLimit: vi.fn(),
  rateLimitSource: vi.fn(() => "203.0.113.44"),
  hasReleasedMetricValue: vi.fn(),
  isMetricReleased: vi.fn(),
  prisma: {
    drillSubmission: { findFirst: vi.fn() },
    coachingPlan: { findFirst: vi.fn() },
    userReport: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "athlete-1", role: "ATHLETE" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/customer-metrics", () => ({
  hasReleasedMetricValue: mocks.hasReleasedMetricValue,
  isMetricReleased: mocks.isMetricReleased,
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.checkDatabaseRateLimit,
  rateLimitSource: mocks.rateLimitSource,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/reports/route");

function reportRequest(submissionId: string, metricName?: string, reportedValue?: number, requestType = "ISSUE") {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId, metricName, reportedValue, requestType, reason: "Incorrect analysis", details: "Review requested" }),
  });
}

function recommendationReportRequest(coachingPlanId: string, recommendationActionIndex: number) {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coachingPlanId, recommendationActionIndex, requestType: "HUMAN_REVIEW", reason: "Recommendation needs review", details: "The action is not practical for this session." }),
  });
}

describe("submission report authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkDatabaseRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.isMetricReleased.mockReturnValue(true);
    mocks.hasReleasedMetricValue.mockReturnValue(true);
    mocks.prisma.userReport.create.mockResolvedValue({ id: "report-1" });
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("does not let an athlete attach a report to another athlete's submission", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue(null);

    const response = await POST(reportRequest("foreign-submission"));

    expect(response.status).toBe(404);
    expect(mocks.prisma.drillSubmission.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-submission", athleteId: "athlete-1" },
      include: {
        drillDefinition: { include: { metricValidations: true } },
        metricResult: true,
      },
    });
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("accepts a report for the athlete's own submission and records a minimal audit event", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({ id: "own-submission" });

    const response = await POST(reportRequest("own-submission"));

    expect(response.status).toBe(200);
    expect(mocks.prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: "athlete-1",
        submissionId: "own-submission",
        requestType: "ISSUE",
        reason: "Incorrect analysis",
        details: "Review requested",
      },
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission report filed",
        metadata: {
          action: "SUBMISSION_REPORT_FILED",
          actorUserId: "athlete-1",
          reportId: "report-1",
        },
      },
    });
  });

  it("persists a report's selected released primary metric", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({
      id: "own-submission",
      metadata: {},
      metricResult: { metricVersion: "model-1", sprintTime: 3.4 },
      drillDefinition: {
        slug: "sprint-20m",
        metricPrimaryKey: "sprintTime",
        metricValidations: [{ metricName: "sprintTime" }],
      },
    });

    const response = await POST(reportRequest("own-submission", "sprintTime"));

    expect(response.status).toBe(200);
    expect(mocks.hasReleasedMetricValue).toHaveBeenCalledWith(
      expect.objectContaining({ metricVersion: "model-1", sprintTime: 3.4 }),
      new Set(["sprintTime"]),
      "sprintTime",
      {},
      "1.1.0",
    );
    expect(mocks.prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: "athlete-1",
        submissionId: "own-submission",
        metricName: "sprintTime",
        requestType: "ISSUE",
        reason: "Incorrect analysis",
        details: "Review requested",
      },
    });
  });

  it("rejects a claimed corrected value when no released metric is selected", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({ id: "own-submission" });

    const response = await POST(reportRequest("own-submission", undefined, 3.25));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "A corrected value requires a released metric scope." });
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("persists an athlete-claimed corrected value only with the selected released primary metric", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({
      id: "own-submission",
      metadata: {},
      metricResult: { metricVersion: "model-1", sprintTime: 3.4 },
      drillDefinition: {
        slug: "sprint-20m",
        metricPrimaryKey: "sprintTime",
        metricValidations: [{ metricName: "sprintTime" }],
      },
    });

    const response = await POST(reportRequest("own-submission", "sprintTime", 3.25));

    expect(response.status).toBe(200);
    expect(mocks.prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: "athlete-1",
        submissionId: "own-submission",
        metricName: "sprintTime",
        reportedValue: 3.25,
        requestType: "ISSUE",
        reason: "Incorrect analysis",
        details: "Review requested",
      },
    });
  });

  it("does not let a client attach an unreleased or non-primary metric to a report", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({
      id: "own-submission",
      metadata: {},
      metricResult: { metricVersion: "model-1", sprintTime: 3.4 },
      drillDefinition: {
        slug: "sprint-20m",
        metricPrimaryKey: "sprintTime",
        metricValidations: [{ metricName: "techniqueScore" }],
      },
    });

    const response = await POST(reportRequest("own-submission", "techniqueScore"));

    expect(response.status).toBe(400);
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("persists a submission-scoped human-review request without treating it as an automatic correction", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({ id: "own-submission" });

    const response = await POST(reportRequest("own-submission", undefined, undefined, "HUMAN_REVIEW"));

    expect(response.status).toBe(200);
    expect(mocks.prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: "athlete-1",
        submissionId: "own-submission",
        requestType: "HUMAN_REVIEW",
        reason: "Incorrect analysis",
        details: "Review requested",
      },
    });
  });

  it("persists a submission-scoped reprocessing request for administrator review without queuing processing", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({ id: "own-submission" });

    const response = await POST(reportRequest("own-submission", undefined, undefined, "REPROCESS"));

    expect(response.status).toBe(200);
    expect(mocks.prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: "athlete-1",
        submissionId: "own-submission",
        requestType: "REPROCESS",
        reason: "Incorrect analysis",
        details: "Review requested",
      },
    });
  });

  it("accepts feedback only for the athlete's own current coaching-plan action", async () => {
    mocks.prisma.coachingPlan.findFirst.mockResolvedValue({
      id: "plan-1",
      recommendations: ["Complete 3 sets", "Review foot placement"],
    });

    const response = await POST(recommendationReportRequest("plan-1", 1));

    expect(response.status).toBe(200);
    expect(mocks.prisma.coachingPlan.findFirst).toHaveBeenCalledWith({
      where: { id: "plan-1", athleteId: "athlete-1", status: "ACTIVE" },
      select: { id: true, recommendations: true },
    });
    expect(mocks.prisma.userReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: "athlete-1",
        coachingPlanId: "plan-1",
        recommendationActionIndex: 1,
        requestType: "HUMAN_REVIEW",
        reason: "Recommendation needs review",
        details: "The action is not practical for this session.",
      },
    });
  });

  it("rejects a foreign or out-of-range coaching-plan action without creating a report", async () => {
    mocks.prisma.coachingPlan.findFirst.mockResolvedValue(null);

    const response = await POST(recommendationReportRequest("foreign-plan", 99));

    expect(response.status).toBe(404);
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("rejects an action index outside the owner plan's current recommendations", async () => {
    mocks.prisma.coachingPlan.findFirst.mockResolvedValue({ id: "plan-1", recommendations: ["Complete 3 sets"] });

    const response = await POST(recommendationReportRequest("plan-1", 1));

    expect(response.status).toBe(404);
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown request type before looking up a submission", async () => {
    const response = await POST(reportRequest("own-submission", undefined, undefined, "UNSUPPORTED"));

    expect(response.status).toBe(400);
    expect(mocks.prisma.drillSubmission.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("rejects contact details and external links before looking up or persisting a report", async () => {
    const response = await POST(new Request("http://localhost/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: "own-submission",
        reason: "Contact me at athlete@example.com",
        details: "https://example.com/private-video",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid report payload." });
    expect(mocks.prisma.drillSubmission.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("rejects a phone number in report details before looking up or persisting a report", async () => {
    const response = await POST(new Request("http://localhost/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: "own-submission",
        reason: "Incorrect analysis",
        details: "Call 555-123-4567 for more information.",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid report payload." });
    expect(mocks.prisma.drillSubmission.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("rate limits authenticated report spam before touching submissions", async () => {
    mocks.checkDatabaseRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });

    const response = await POST(reportRequest("own-submission"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mocks.checkDatabaseRateLimit).toHaveBeenLastCalledWith({
      namespace: "submission-report-account",
      identifier: "athlete-1",
      windowMs: 60 * 60_000,
      maxRequests: 10,
    });
    expect(mocks.prisma.drillSubmission.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("fails closed on a shared source report limit before parsing or querying the submission", async () => {
    mocks.checkDatabaseRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });

    const response = await POST(reportRequest("own-submission"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mocks.rateLimitSource).toHaveBeenCalledTimes(1);
    expect(mocks.checkDatabaseRateLimit).toHaveBeenCalledWith({
      namespace: "submission-report-source",
      identifier: "203.0.113.44",
      windowMs: 60 * 60_000,
      maxRequests: 20,
    });
    expect(mocks.prisma.drillSubmission.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.userReport.create).not.toHaveBeenCalled();
  });

  it("fails closed when the report audit cannot be written", async () => {
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue({ id: "own-submission" });
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(reportRequest("own-submission"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Report could not be recorded safely." });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
