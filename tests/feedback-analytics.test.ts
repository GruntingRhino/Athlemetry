import { describe, expect, it } from "vitest";

import { summarizeFeedbackTrustSignals } from "@/lib/feedback-analytics";

describe("feedback trust analytics", () => {
  it("summarizes only submitted ratings and keeps unresolved counts explicit", () => {
    expect(summarizeFeedbackTrustSignals([
      { status: "OPEN", accuracyRating: 2, usefulnessRating: 3 },
      { status: "RESOLVED", accuracyRating: 4, usefulnessRating: null },
      { status: "IN_REVIEW", accuracyRating: null, usefulnessRating: 5 },
    ])).toEqual({
      reportCount: 3,
      ratedReportCount: 3,
      averageAccuracyRating: 3,
      averageUsefulnessRating: 4,
      openReportCount: 2,
    });
  });
});
