export type AthleteChecklistInput = {
  profileComplete: boolean;
  consentRequired: boolean;
  consentVerified: boolean;
  /** Whether paid access is actually enforced (see `shouldEnforceBilling`). */
  billingEnforced: boolean;
  hasPaidAccess: boolean;
  submissionCount: number;
  /** Submissions whose primary metric is released to the athlete. */
  releasedResultCount: number;
};

export type AthleteChecklistStep = {
  key: "profile" | "consent" | "membership" | "upload" | "result";
  label: string;
  href: string;
  actionLabel: string;
  complete: boolean;
  detail?: string;
};

/**
 * A step is complete only when the thing it names happened: uploading is not a
 * result, and billing/consent steps appear only when they apply.
 */
export function buildAthleteChecklist(input: AthleteChecklistInput) {
  const steps: AthleteChecklistStep[] = [
    { key: "profile", label: "Complete athlete profile", href: "/profile", actionLabel: "Open profile", complete: input.profileComplete },
  ];
  if (input.consentRequired) {
    steps.push({
      key: "consent",
      label: "Verify parent or guardian consent",
      href: "/consent",
      actionLabel: "Verify consent",
      complete: input.consentVerified,
    });
  }
  if (input.billingEnforced) {
    steps.push({ key: "membership", label: "Activate membership", href: "/billing", actionLabel: "View plans", complete: input.hasPaidAccess });
  }
  const uploaded = input.submissionCount > 0;
  steps.push({
    key: "upload",
    label: "Upload your first clip",
    href: "/submissions/new",
    actionLabel: "Upload a clip",
    complete: uploaded,
  });
  const hasResult = input.releasedResultCount > 0;
  steps.push({
    key: "result",
    label: "Get a validated result",
    href: uploaded ? "/submissions" : "/submissions/new",
    actionLabel: uploaded ? "See your clips" : "Upload a clip",
    complete: hasResult,
  });

  return {
    steps,
    totalCount: steps.length,
    completedCount: steps.filter((step) => step.complete).length,
  };
}
