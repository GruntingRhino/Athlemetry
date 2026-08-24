import { BackToSports } from "@/components/layout/back-to-sports";
import { ReportWithdrawButton } from "@/components/forms/report-withdraw-button";
import { requireUser } from "@/lib/authz";
import { readFeedbackHistoryForOwner } from "@/lib/feedback-history";

export const dynamic = "force-dynamic";

export default async function FeedbackHistoryPage() {
  const user = await requireUser();
  const reports = await readFeedbackHistoryForOwner(user.id);

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Feedback and disputes</div>
        <h1 className="mt-4 athlemetry-section-heading">Feedback history</h1>
        <p className="athlemetry-section-lead">
          Review the status and resolution notes for reports submitted from your account. This history does not expose reviewer identities or other athletes’ reports.
        </p>
      </section>

      {reports.length === 0 ? (
        <section className="athlemetry-card p-6 text-sm text-slate-600">No feedback reports have been submitted from this account.</section>
      ) : (
        <section className="space-y-4">
          {reports.map((report) => (
            <article key={report.id} className="athlemetry-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{report.reason}</h2>
                  <p className="mt-1 text-sm text-slate-500">Submitted {report.createdAt.toISOString().slice(0, 10)}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {report.requestType === "HUMAN_REVIEW"
                      ? "Human review request"
                      : report.requestType === "REPROCESS"
                        ? "Reprocessing request"
                        : "Issue report"}
                  </p>
                  {report.metricName ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Metric: {report.metricName}</p> : null}
                  {report.metricName && report.reportedValue !== null ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Claimed corrected value: {report.reportedValue}</p> : null}
                  {report.disputedFrameIndex !== null ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Disputed frame: {report.disputedFrameIndex}</p> : null}
                  {report.accuracyRating !== null || report.usefulnessRating !== null ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ratings: accuracy {report.accuracyRating ?? "—"}/5 · usefulness {report.usefulnessRating ?? "—"}/5</p> : null}
                </div>
                <span className="athlemetry-chip px-3 py-1 text-[11px] uppercase tracking-[0.16em]">{report.status}</span>
              </div>
              {report.status === "OPEN" ? <ReportWithdrawButton reportId={report.id} /> : null}
              {report.statusEvents.length > 0 ? (
                <ol className="mt-5 space-y-4 border-l border-slate-200 pl-4">
                  {report.statusEvents.map((event) => (
                    <li key={`${event.createdAt.toISOString()}-${event.status}`}>
                      <p className="text-sm font-semibold text-slate-900">{event.status} · {event.createdAt.toISOString().slice(0, 10)}</p>
                      {event.resolutionNote ? <p className="mt-1 text-sm leading-6 text-slate-700">{event.resolutionNote}</p> : null}
                      {event.resolutionNoteWasWithheld ? (
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          This legacy resolution note was withheld because it contains contact details or an external link.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-sm text-slate-600">No review update has been recorded yet.</p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
