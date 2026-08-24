import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "coach-1" },
  findMany: vi.fn(),
  management: vi.fn(() => null),
}));

vi.mock("@/lib/authz", () => ({ requireRole: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/prisma", () => ({ prisma: { team: { findMany: mocks.findMany } } }));
vi.mock("@/components/teams/team-management", () => ({ TeamManagement: mocks.management }));

const { default: TeamsPage } = await import("@/app/teams/page");

describe("team invitation revocation UI boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      {
        id: "team-1",
        name: "North Stars",
        sport: "soccer",
        createdAt: new Date("2026-07-30T12:00:00.000Z"),
        _count: { memberships: 1 },
        invitations: [{
          id: "invitation-1",
          createdAt: new Date("2026-07-30T13:00:00.000Z"),
          expiresAt: new Date("2026-08-13T13:00:00.000Z"),
        }],
      },
    ]);
  });

  it("provides owners only opaque pending-invitation identifiers and timestamps for revocation", async () => {
    renderToStaticMarkup(await TeamsPage());

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { ownerId: "coach-1" },
      select: {
        id: true,
        name: true,
        sport: true,
        createdAt: true,
        _count: { select: { memberships: true } },
        invitations: {
          where: { status: "PENDING", expiresAt: { gt: expect.any(Date) } },
          select: { id: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.management).toHaveBeenCalledWith({
      initialTeams: [{
        id: "team-1",
        name: "North Stars",
        sport: "soccer",
        createdAt: "2026-07-30T12:00:00.000Z",
        memberCount: 1,
        pendingInvitations: [{
          id: "invitation-1",
          createdAt: "2026-07-30T13:00:00.000Z",
          expiresAt: "2026-08-13T13:00:00.000Z",
        }],
      }],
    }, undefined);
  });
});
