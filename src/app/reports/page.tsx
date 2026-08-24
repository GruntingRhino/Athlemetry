import { BackToSports } from "@/components/layout/back-to-sports";
import { ReportExportButton } from "@/components/forms/report-export-button";
import { requireUser } from "@/lib/authz";
import { requirePaidFeatureAccess } from "@/lib/billing-access";
import { buildCustomerReports } from "@/lib/customer-reports";
import { formatCustomerMetricDelta, formatCustomerMetricValue } from "@/lib/metric-presentation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AthleteReportsPage() {
  const user = await requireUser();
  await requirePaidFeatureAccess(user);
  const submissions = await prisma.drillSubmission.findMany({
    where: { athleteId: user.id, processingStatus: "COMPLETED" },
    include: {
      drillDefinition: { include: { metricValidations: true } },
      metricResult: true,
      benchmarkSnapshots: true,
    },
    orderBy: { recordingDate: "desc" },
  });

  const reports = buildCustomerReports(submissions.map((submission) => ({
    ...submission,
    metricResult: submission.metricResult ? { ...submission.metricResult } : null,
  })));

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Evidence-backed results</div>
        <h1 className="mt-4 athlemetry-section-heading">Athlete reports</h1>
        <p className="athlemetry-section-lead">Only independently released metrics are included. Historical reports update when validation evidence is approved or withdrawn.</p>
        <ReportExportButton />
      </section>
      {reports.length === 0 ? (
        <section className="athlemetry-card p-6 text-sm text-slate-600">No customer-facing report is available because no completed metric has cleared its validation gate.</section>
      ) : (
        <section className="space-y-5">
          {reports.map(({ submission, values }) => (
            <article key={submission.id} className="athlemetry-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-xl font-semibold text-slate-950">{submission.drillDefinition.name}</h2><p className="mt-1 text-sm text-slate-500">{submission.recordingDate.toISOString().slice(0, 10)} · {submission.location}</p></div>
                <span className="athlemetry-chip">Validated report</span>
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {values.map(({ key, value, presentation, evidenceTimestamp, previousComparableAssessment }) => (
                  <div key={key} className="athlemetry-stat">
                    <dt className="athlemetry-stat-label">{presentation.label}</dt>
                    <dd className="athlemetry-stat-value text-2xl">{formatCustomerMetricValue(value, presentation.unit)}</dd>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{presentation.definition}</p>
                    <dl className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                      <div><dt className="font-semibold text-slate-700">Measurement type</dt><dd>{presentation.measurementType}</dd></div>
                      <div><dt className="font-semibold text-slate-700">How it is measured</dt><dd>{presentation.method}</dd></div>
                      <div><dt className="font-semibold text-slate-700">What it means</dt><dd>{presentation.interpretation}</dd></div>
                      <div><dt className="font-semibold text-slate-700">Limits</dt><dd>{presentation.limitations}</dd></div>
                    </dl>
                    <p className="mt-2 text-xs font-medium text-slate-500">Evidence verified {new Date(evidenceTimestamp).toISOString().slice(0, 10)}</p>
                    {previousComparableAssessment ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        Numerical change from the previous compatible result ({previousComparableAssessment.recordingDate.toISOString().slice(0, 10)}): {formatCustomerMetricDelta(value - previousComparableAssessment.value, presentation.unit)}.
                      </p>
                    ) : null}
                  </div>
                ))}
              </dl>
              {submission.benchmarkSnapshots ? <p className="mt-4 text-sm text-slate-700">Verified peer percentile: <strong>{Math.round(submission.benchmarkSnapshots.percentile)}</strong></p> : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
