export const PRODUCT_NOTICE_EFFECTIVE_DATE = "2026-07-30";

type NoticeSection = {
  heading: string;
  paragraphs: readonly string[];
};

type ProductNotice = {
  title: string;
  version: string;
  effectiveDate: string;
  sections: readonly NoticeSection[];
};

export const PRODUCT_NOTICES: Record<"privacy" | "terms", ProductNotice> = {
  privacy: {
    title: "Privacy Notice",
    version: "2026-07-30.1",
    effectiveDate: PRODUCT_NOTICE_EFFECTIVE_DATE,
    sections: [
      {
        heading: "Scope",
        paragraphs: [
          "This product notice describes the privacy controls currently implemented in this Athlemetry application. It is not a deployment or regulatory compliance certification.",
          "The application stores account, profile, drill-submission, consent, and related service records needed to operate the product. Video handling and retention depend on the configured storage provider and runtime environment.",
        ],
      },
      {
        heading: "Controls available in the product",
        paragraphs: [
          "Authenticated users can manage profile and benchmark preferences, request a data export, request account deletion with password confirmation, change a password with current-password confirmation, and review recorded consent actions.",
          "Model-training preference is default-deny until an authenticated account explicitly opts in. The product records grant and withdrawal history and includes the current preference and history in the privacy export.",
          "An athlete owner can grant and revoke a named existing account’s read-only access to one submission and its reports. This is not public, recruiter, team, club, coach-hierarchy, or search-based sharing.",
        ],
      },
      {
        heading: "Important limits and open evidence",
        paragraphs: [
          "This notice does not claim production encryption, KMS configuration, external-provider handling, or deployment security review. The product has not verified guardian identity beyond its existing account and consent relationships.",
          "Stored preferences and access controls do not establish model accuracy, training authorization at every future data-use boundary, legal compliance, or a deployed privacy guarantee. Those claims require separate runtime, production, legal, and evidence review.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Use",
    version: "2026-07-30.1",
    effectiveDate: PRODUCT_NOTICE_EFFECTIVE_DATE,
    sections: [
      {
        heading: "Product use",
        paragraphs: [
          "Athlemetry provides structured drill submission, conservative analysis display, benchmark preferences, and account-managed privacy controls. Use the product only for accounts and submissions you are authorized to manage.",
          "Users remain responsible for the accuracy of submitted information, lawful use of accounts, and obtaining any permissions needed before uploading or sharing content.",
        ],
      },
      {
        heading: "Feature boundaries",
        paragraphs: [
          "Read-only sharing is limited to one owner-selected existing account and one explicit submission plus its reports. The product does not provide public discovery, recruiter sharing, team or club access, coach hierarchy, or broad search through this feature.",
          "Analysis and benchmark displays are subject to product validation and release controls. Product availability or an on-screen result does not establish fitness, medical, recruiting, training, or performance conclusions.",
        ],
      },
      {
        heading: "Notice status",
        paragraphs: [
          "These Terms of Use are a plainly scoped product notice, not legal advice, and not a legal review. They do not claim regulatory compliance, production certification, KMS deployment, production encryption, guardian identity verification, model accuracy, or deployment approval.",
          "Any legal, regulatory, contractual, production-security, or operational review remains open and must be performed separately before relying on the product for those purposes.",
        ],
      },
    ],
  },
};
