import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  findFirst: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  createEvent: vi.fn(),
  transaction: vi.fn(),
  evidenceCurrent: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/coaching-plans", () => ({
  isCoachingPlanEvidenceCurrent: mocks.evidenceCurrent,
  isCoachingActionIndexValid: (recommendations: unknown, actionIndex: number) =>
    Array.isArray(recommendations) && actionIndex >= 0 && actionIndex < recommendations.length,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    coachingPlan: { findFirst: mocks.findFirst },
    coachingPlanActionCompletion: { upsert: mocks.upsert, deleteMany: mocks.deleteMany },
    coachingPlanActionEvent: { create: mocks.createEvent },
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/coaching/plans/[id]/actions/route");
const context = { params: Promise.resolve({ id: "plan-1" }) };
const currentPlan = {
  id: "plan-1",
  drillDefinitionId: "drill-1",
  recommendations: ["Complete 3 sets"],
  drillDefinition: { slug: "soccer-sprint", metricPrimaryKey: "sprintTime" },
  sourceSubmission: { metadata: {}, metricResult: { metricVersion: "v1", sprintTime: 4.2 } },
};

function request(body: unknown) {
  return new Request("http://localhost/api/coaching/plans/plan-1/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/coaching/plans/[id]/actions", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.findFirst.mockReset();
    mocks.upsert.mockReset();
    mocks.deleteMany.mockReset();
    mocks.createEvent.mockReset();
    mocks.transaction.mockReset();
    mocks.evidenceCurrent.mockReset();
    mocks.transaction.mockImplementation(async (operation) => operation({
      coachingPlanActionCompletion: { upsert: mocks.upsert, deleteMany: mocks.deleteMany },
      coachingPlanActionEvent: { create: mocks.createEvent },
    }));
  });

  it("rejects anonymous completion writes", async () => {
    const response = await POST(request({ actionIndex: 0, completed: true }), context);
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects malformed or out-of-range action indexes", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    const malformed = await POST(request({ actionIndex: -1, completed: true }), context);
    expect(malformed.status).toBe(400);

    mocks.findFirst.mockResolvedValue(currentPlan);
    mocks.evidenceCurrent.mockResolvedValue(true);
    const outOfRange = await POST(request({ actionIndex: 1, completed: true }), context);
    expect(outOfRange.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("writes completion only for the current athlete's released plan", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.findFirst.mockResolvedValue(currentPlan);
    mocks.evidenceCurrent.mockResolvedValue(true);
    mocks.upsert.mockResolvedValue({});

    const response = await POST(request({ actionIndex: 0, completed: true }), context);

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "plan-1", athleteId: "athlete-1", status: "ACTIVE" },
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { coachingPlanId_actionIndex: { coachingPlanId: "plan-1", actionIndex: 0 } },
      create: { coachingPlanId: "plan-1", actionIndex: 0 },
    }));
    expect(mocks.createEvent).toHaveBeenCalledWith({
      data: {
        coachingPlanId: "plan-1",
        actionIndex: 0,
        actorUserId: "athlete-1",
        completed: true,
      },
    });
  });

  it("withholds completion when the plan's evidence is no longer current", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.findFirst.mockResolvedValue(currentPlan);
    mocks.evidenceCurrent.mockResolvedValue(false);

    const response = await POST(request({ actionIndex: 0, completed: true }), context);

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("removes an existing completion when unchecked", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.findFirst.mockResolvedValue(currentPlan);
    mocks.evidenceCurrent.mockResolvedValue(true);
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    const response = await POST(request({ actionIndex: 0, completed: false }), context);

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { coachingPlanId: "plan-1", actionIndex: 0 } });
    expect(mocks.createEvent).toHaveBeenCalledWith({
      data: {
        coachingPlanId: "plan-1",
        actionIndex: 0,
        actorUserId: "athlete-1",
        completed: false,
      },
    });
  });

  it("fails closed when the immutable adherence event cannot be written", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.findFirst.mockResolvedValue(currentPlan);
    mocks.evidenceCurrent.mockResolvedValue(true);
    mocks.upsert.mockResolvedValue({});
    mocks.createEvent.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(request({ actionIndex: 0, completed: true }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Training-action completion could not be updated safely." });
  });
});
