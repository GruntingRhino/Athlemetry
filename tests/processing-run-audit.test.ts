import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; role: string } } | null,
  isWorkerTokenAuthorized: vi.fn(),
  runProcessingBatch: vi.fn(),
  systemLogCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/worker-auth", () => ({ isWorkerTokenAuthorized: mocks.isWorkerTokenAuthorized }));
vi.mock("@/lib/processing/queue", () => ({ runProcessingBatch: mocks.runProcessingBatch }));
vi.mock("@/lib/prisma", () => ({ prisma: { systemLog: { create: mocks.systemLogCreate } } }));

const { POST } = await import("@/app/api/processing/run/route");

describe("POST /api/processing/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.isWorkerTokenAuthorized.mockReturnValue(false);
    mocks.runProcessingBatch.mockResolvedValue({ total: 2, completed: 2, failed: 0 });
    mocks.systemLogCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("audits an administrator before starting a processing batch", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };

    const response = await POST(new Request("http://localhost/api/processing/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 20 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.systemLogCreate).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Processing batch initiated",
        metadata: { action: "PROCESSING_BATCH_INITIATED", actorUserId: "admin-1", limit: 20 },
      },
    });
    expect(mocks.systemLogCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runProcessingBatch.mock.invocationCallOrder[0],
    );
  });
});
