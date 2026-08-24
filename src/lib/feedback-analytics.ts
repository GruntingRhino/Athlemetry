export type FeedbackTrustSignal = {
  status: string;
  accuracyRating: number | null;
  usefulnessRating: number | null;
};

export function summarizeFeedbackTrustSignals(reports: FeedbackTrustSignal[]) {
  const rated = reports.filter((report) => report.accuracyRating !== null || report.usefulnessRating !== null);
  const average = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  };

  return {
    reportCount: reports.length,
    ratedReportCount: rated.length,
    averageAccuracyRating: average(reports.map((report) => report.accuracyRating)),
    averageUsefulnessRating: average(reports.map((report) => report.usefulnessRating)),
    openReportCount: reports.filter((report) => report.status === "OPEN" || report.status === "IN_REVIEW").length,
  };
}
