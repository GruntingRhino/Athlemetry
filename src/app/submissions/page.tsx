import Link from "next/link";

import { ReportForm } from "@/components/forms/report-form";
import { SubmissionSharingForm } from "@/components/forms/submission-sharing-form";
import { SubmissionVideoReview } from "@/components/forms/submission-video-review";
import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { readCaptureAssessment } from "@/lib/capture-adherence";
import { hasReleasedMetricValue, isMetricReleased } from "@/lib/customer-metrics";
import { calculateReleasedSubmissionScore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { formatPercent, formatSeconds } from "@/lib/utils";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { getMetricPresentation } from "@/lib/metric-presentation";

export const dynamic = "force-dynamic";

type AnalysisSummary = {
  primaryLabel?: string;
  primaryValue?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  reliabilityLabel?: string;
  reliabilityValue?: string;
  note?: string;
  spinRateStatus?: { state?: string; reason?: string };
};

function readAnalysisSummary(metadata: unknown): AnalysisSummary | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const summary = (metadata as Record<string, unknown>).analysisSummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  return summary as AnalysisSummary;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ sport?: string }> | { sport?: string };
}) {
  const user = await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const sport = typeof resolvedSearchParams.sport === "string" && resolvedSearchParams.sport.trim() ? normalizeSport(resolvedSearchParams.sport) : null;

  const submissions = await prisma.drillSubmission.findMany({
    where:
      user.role === "ADMIN"
        ? sport
          ? { drillDefinition: { sport } }
          : {}
        : {
            athleteId: user.id,
            ...(sport ? { drillDefinition: { sport } } : {}),
          },
    include: {
      metricResult: true,
      benchmarkSnapshots: true,
      drillDefinition: {
        include: { metricValidations: true },
      },
      reviewedKeyMoments: {
        select: { frameIndex: true, label: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="athlemetry-kicker">{sport ? `${SPORT_LABELS[sport]} submissions` : "Submission archive"}</div>
            <h1 className="mt-4 athlemetry-section-heading">
              {sport ? `${SPORT_LABELS[sport]} uploads, processing status, and analysis notes.` : "Uploads, processing status, and analysis notes."}
            </h1>
            <p className="athlemetry-section-lead">
              {sport
                ? `${SPORT_LABELS[sport]} submissions stay in one lane so you can jump from upload to dashboard without mixing sports.`
                : "Baseball uploads now surface explicit clarity notes instead of silently hiding what the model cannot support."}
            </p>
          </div>
          <Link href={sport ? `/submissions/new?sport=${sport}` : "/submissions/new"} className="athlemetry-button athlemetry-button-primary">
            New submission
          </Link>
        </div>
      </section>

      <div className="space-y-4 lg:space-y-5">
        {submissions.map((submission) => {
          const captureAssessment = readCaptureAssessment(submission.metadata);
          const releasedMetricNames = new Set(
            submission.drillDefinition.metricValidations
              .filter((validation) => isMetricReleased(submission.drillDefinition.slug, validation.metricName, submission.metricResult?.metricVersion ?? "unavailable", validation))
              .map((validation) => validation.metricName),
          );
          const protocol = DRILL_PROTOCOLS[submission.drillDefinition.slug as keyof typeof DRILL_PROTOCOLS];
          const primaryReleased = hasReleasedMetricValue(
            submission.metricResult ? { ...submission.metricResult } : null,
            releasedMetricNames,
            submission.drillDefinition.metricPrimaryKey,
            submission.metadata,
            protocol?.version ?? "unavailable",
          );
          const isReleased = (metricName: string) =>
            primaryReleased && metricName === submission.drillDefinition.metricPrimaryKey;
          const compositeScore = primaryReleased
            ? calculateReleasedSubmissionScore(
                submission.metricResult,
                new Set([submission.drillDefinition.metricPrimaryKey]),
              )
            : null;
          const analysisSummary = readAnalysisSummary(submission.metadata);

          return (
            <article key={submission.id} className="athlemetry-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-800">
                      {submission.drillDefinition.sport}
                    </p>
                    <span className="athlemetry-chip px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-700">
                      {submission.processingStatus}
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{submission.drillDefinition.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {submission.submittedAt.toISOString().slice(0, 19).replace("T", " ")} • {submission.location}
                  </p>
                </div>
                <form action={`/api/submissions/${submission.id}/retry`} method="post">
                  <button
                    className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs"
                    type="submit"
                  >
                    Retry processing
                  </button>
                </form>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  ["Sprint", isReleased("sprintTime") ? formatSeconds(submission.metricResult?.sprintTime) : "Research only"],
                  ["Accel", isReleased("accelerationTiming") ? formatSeconds(submission.metricResult?.accelerationTiming) : "Research only"],
                  ["COD", isReleased("changeOfDirectionMeasurement") ? formatSeconds(submission.metricResult?.changeOfDirectionMeasurement) : "Research only"],
                  ["Shot", isReleased("shotTiming") ? formatSeconds(submission.metricResult?.shotTiming) : "Research only"],
                  ["Percentile", primaryReleased && submission.benchmarkSnapshots ? formatPercent(submission.benchmarkSnapshots.percentile) : "Unavailable"],
                  ["Composite", compositeScore !== null ? `${compositeScore.toFixed(1)}/100` : "-"],
                ].map(([label, value]) => (
                  <div key={label as string} className="athlemetry-panel-item">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                    <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>

              {!primaryReleased && submission.processingStatus === "COMPLETED" ? (
                <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  {captureAssessment && captureAssessment.status !== "VERIFIED"
                    ? `This recording did not clear per-submission protocol checks (${captureAssessment.reasons.join(", ")}). Customer metrics, coaching claims, progress comparisons, and rankings remain hidden.`
                    : "Analysis completed in research-only mode. Customer metrics, mechanics claims, progress comparisons, and rankings remain hidden until this exact protocol, capture, and metric pass their validation gates."}
                </div>
              ) : null}

              {analysisSummary && primaryReleased ? (
                <div className="mt-5 rounded-[24px] border border-teal-100 bg-teal-50/60 p-4 md:p-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
                        {analysisSummary.primaryLabel ?? "Primary result"}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-950">{analysisSummary.primaryValue ?? "-"}</p>
                    </div>

                    {analysisSummary.reliabilityLabel ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
                          {analysisSummary.reliabilityLabel}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">{analysisSummary.reliabilityValue ?? "-"}</p>
                      </div>
                    ) : null}
                  </div>
                  {analysisSummary.note ? <p className="mt-3 text-sm leading-6 text-slate-700">{analysisSummary.note}</p> : null}
                  {analysisSummary.spinRateStatus?.reason ? (
                    <p className="mt-2 text-sm font-medium text-slate-700">RPM: {analysisSummary.spinRateStatus.reason}</p>
                  ) : null}
                </div>
              ) : null}

              {submission.reviewedKeyMoments.length > 0 ? (
                <section className="mt-5 rounded-[22px] border border-teal-100 bg-teal-50/60 p-4 md:p-5" aria-labelledby={`key-moments-${submission.id}`}>
                  <h2 id={`key-moments-${submission.id}`} className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">Reviewed key moments</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">These are administrator review notes tied to video frame positions. They are not automated coaching, health, or performance claims.</p>
                  <ol className="mt-4 space-y-3">
                    {submission.reviewedKeyMoments.map((moment) => (
                      <li key={`${moment.frameIndex}-${moment.label}`} className="rounded-2xl border border-teal-100 bg-white/80 p-3 text-sm text-slate-700">
                        <p><strong className="text-slate-950">{moment.label}</strong> · frame {moment.frameIndex}</p>
                        <p className="mt-1">{moment.note}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {submission.storageProvider && submission.storageKey && submission.videoExpiresAt && submission.videoExpiresAt > new Date() && !submission.videoDeletedAt ? (
                <SubmissionVideoReview
                  submissionId={submission.id}
                  frameRate={submission.frameRate}
                  keyMoments={submission.reviewedKeyMoments}
                />
              ) : null}

              <details className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.18em] text-slate-700">
                  Report this submission
                </summary>
                <div className="mt-3">
                  <ReportForm
                    submissionId={submission.id}
                    reportableMetric={primaryReleased
                      ? (() => {
                          const metricName = submission.drillDefinition.metricPrimaryKey;
                          const presentation = getMetricPresentation(metricName);
                          return presentation ? { name: metricName, label: presentation.label } : undefined;
                        })()
                      : undefined}
                  />
                </div>
              </details>
              {submission.athleteId === user.id ? <SubmissionSharingForm submissionId={submission.id} /> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
