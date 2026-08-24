import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const mocks = vi.hoisted(() => ({
  prisma: {
    consentLog: { findFirst: vi.fn(), findMany: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { readPrivacyConsentHistoryForOwner } = await import("@/lib/privacy-consent-history");

describe("privacy consent history boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("returns only the owner's bounded consent history after recording a minimal audit event", async () => {
    const consentLogs = [{ id: "consent-1" }];
    const modelTrainingConsent = { granted: true };
    mocks.prisma.consentLog.findMany.mockResolvedValue(consentLogs);
    mocks.prisma.consentLog.findFirst.mockResolvedValue(modelTrainingConsent);

    await expect(readPrivacyConsentHistoryForOwner("athlete-1")).resolves.toEqual({
      consentLogs,
      modelTrainingConsent,
    });

    expect(mocks.prisma.consentLog.findMany).toHaveBeenCalledWith({
      where: { userId: "athlete-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    expect(mocks.prisma.consentLog.findFirst).toHaveBeenCalledWith({
      where: { userId: "athlete-1", consentType: "MODEL_TRAINING" },
      orderBy: { createdAt: "desc" },
      select: { granted: true },
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Privacy consent history viewed",
        metadata: { action: "PRIVACY_CONSENT_HISTORY_VIEWED", actorUserId: "athlete-1" },
      },
    });
  });

  it("fails closed when the consent-history audit cannot commit", async () => {
    mocks.prisma.consentLog.findMany.mockResolvedValue([{ id: "consent-1" }]);
    mocks.prisma.consentLog.findFirst.mockResolvedValue(null);
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(readPrivacyConsentHistoryForOwner("athlete-1")).rejects.toThrow("audit unavailable");
  });

  it("routes the authenticated privacy page through the audited owner-scoped read boundary", async () => {
    const source = await readFile(path.join(root, "src/app/privacy/page.tsx"), "utf8");

    expect(source).toContain('import { readPrivacyConsentHistoryForOwner } from "@/lib/privacy-consent-history"');
    expect(source).toContain("readPrivacyConsentHistoryForOwner(user.id)");
    expect(source).not.toContain("prisma.");
  });
});