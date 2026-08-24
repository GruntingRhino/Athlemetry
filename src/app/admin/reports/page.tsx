import { ReportReviewForm } from "@/components/forms/report-review-form";
import { requireRole } from "@/lib/authz";
import { summarizeFeedbackTrustSignals } from "@/lib/feedback-analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requireRole(["ADMIN"]);

  const reports = await prisma.userReport.findMany({
    include: {
      reporter: {
        select: {
          email: true,
        },
      },
      submission: {
        select: {
          id: true,
          drillType: true,
        },
      },
      coachingPlan: {
        select: {
          id: true,
          drillDefinition: { select: { name: true } },
        },
      },
      statusEvents: {
        select: { status: true, resolutionNote: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });
  const trust = summarizeFeedbackTrustSignals(reports);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="max-w-3xl">
          <div className="athlemetry-kicker">Admin review</div>
          <h1 className="mt-4 athlemetry-section-heading">User report review</h1>
          <p className="athlemetry-section-lead">
            Review and resolve issue reports from athletes, parents, and coaches without leaving the operating dashboard.
          </p>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Feedback trust signals">
        <div className="athlemetry-panel-item"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Open review queue</p><p className="mt-1 text-xl font-semibold text-slate-950">{trust.openReportCount}</p></div>
        <div className="athlemetry-panel-item"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Accuracy rating</p><p className="mt-1 text-xl font-semibold text-slate-950">{trust.averageAccuracyRating?.toFixed(1) ?? "Unavailable"}</p></div>
        <div className="athlemetry-panel-item"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Usefulness rating</p><p className="mt-1 text-xl font-semibold text-slate-950">{trust.averageUsefulnessRating?.toFixed(1) ?? "Unavailable"}</p></div>
      </section>

      <section className="space-y-3">
        {reports.map((report) => (
          <article key={report.id} className="athlemetry-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-slate-950">{report.reason}</p>
                <p className="mt-1 text-xs text-slate-500">Reporter: {report.reporter.email}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {report.requestType === "HUMAN_REVIEW"
                    ? "Human review request"
                    : report.requestType === "REPROCESS"
                      ? "Reprocessing request"
                      : "Issue report"}
                </p>
              </div>
              <span className="athlemetry-chip px-3 py-1 text-[11px] uppercase tracking-[0.16em]">
                {report.status}
              </span>
            </div>
            {report.details ? <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700">{report.details}</p> : null}
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Submission: {report.submission?.drillType ?? "N/A"}
            </p>
            {report.coachingPlan && report.recommendationActionIndex !== null ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Recommendation feedback: {report.coachingPlan.drillDefinition.name} · action {report.recommendationActionIndex + 1}
              </p>
            ) : null}
            {report.metricName ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Reported metric: {report.metricName}
              </p>
            ) : null}
            {report.metricName && report.reportedValue !== null ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Athlete-claimed corrected value: {report.reportedValue}
              </p>
            ) : null}
            {report.disputedFrameIndex !== null ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Disputed video frame: {report.disputedFrameIndex}</p> : null}
            {report.accuracyRating !== null || report.usefulnessRating !== null ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Trust signals: accuracy {report.accuracyRating ?? "—"}/5 · usefulness {report.usefulnessRating ?? "—"}/5</p> : null}
            {report.statusEvents.length > 0 ? (
              <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700">
                <summary className="cursor-pointer font-semibold">Immutable review history</summary>
                <ol className="mt-3 space-y-3">
                  {report.statusEvents.map((event) => (
                    <li key={`${event.createdAt.toISOString()}-${event.status}`}>
                      <span className="font-semibold">{event.status}</span> · {event.createdAt.toISOString().slice(0, 10)}
                      {event.resolutionNote ? <p className="mt-1">{event.resolutionNote}</p> : null}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            <ReportReviewForm reportId={report.id} currentStatus={report.status} />
          </article>
        ))}
      </section>
    </div>
  );
}
