import { describe, expect, it } from "vitest";

import { buildAthleteChecklist } from "@/lib/onboarding-checklist";

const base = {
  profileComplete: true,
  consentRequired: false,
  consentVerified: false,
  billingEnforced: false,
  hasPaidAccess: false,
  submissionCount: 0,
  releasedResultCount: 0,
};

function byKey(input: Parameters<typeof buildAthleteChecklist>[0]) {
  const checklist = buildAthleteChecklist(input);
  return { checklist, step: (key: string) => checklist.steps.find((step) => step.key === key) };
}

describe("buildAthleteChecklist", () => {
  it("an upload alone is Uploaded, not a validated result", () => {
    const { checklist, step } = byKey({ ...base, submissionCount: 3 });
    expect(step("upload")).toMatchObject({ complete: true, label: "Upload your first clip" });
    expect(step("result")).toMatchObject({ complete: false, href: "/submissions" });
    expect(step("result")?.detail).toBeUndefined(); // the empty-state card below explains it; one message, not two
    expect(checklist.completedCount).toBe(2);
    expect(checklist.totalCount).toBe(3);
  });

  it("completes the result step only when a released metric exists", () => {
    const { step, checklist } = byKey({ ...base, submissionCount: 1, releasedResultCount: 1 });
    expect(step("result")?.complete).toBe(true);
    expect(checklist.completedCount).toBe(checklist.totalCount);
  });

  it("points the result step at the uploader when nothing has been uploaded", () => {
    const { step } = byKey(base);
    expect(step("result")).toMatchObject({ complete: false, href: "/submissions/new" });
    expect(step("upload")?.complete).toBe(false);
  });

  it("omits the membership step when billing is not enforced", () => {
    expect(byKey(base).step("membership")).toBeUndefined();
  });

  it("includes the membership step with a plans action only when billing is enforced", () => {
    const { step, checklist } = byKey({ ...base, billingEnforced: true });
    expect(step("membership")).toMatchObject({ complete: false, href: "/billing", actionLabel: "View plans" });
    expect(checklist.totalCount).toBe(4);
    expect(byKey({ ...base, billingEnforced: true, hasPaidAccess: true }).step("membership")?.complete).toBe(true);
  });

  it("omits the consent step unless consent is required, and completes it only when verified", () => {
    expect(byKey(base).step("consent")).toBeUndefined();
    expect(byKey({ ...base, consentRequired: true }).step("consent")?.complete).toBe(false);
    expect(byKey({ ...base, consentRequired: true, consentVerified: true }).step("consent")?.complete).toBe(true);
  });

  it("counts progress from the steps actually shown", () => {
    const { checklist } = byKey({ ...base, billingEnforced: true, consentRequired: true, consentVerified: true, submissionCount: 1 });
    expect(checklist.totalCount).toBe(5);
    expect(checklist.completedCount).toBe(3);
    expect(checklist.steps.filter((step) => step.complete)).toHaveLength(checklist.completedCount);
  });
});
