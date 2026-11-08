import Link from "next/link";

import { ReportForm } from "@/components/forms/report-form";
import { SubmissionSharingForm } from "@/components/forms/submission-sharing-form";
import { SubmissionVideoReview } from "@/components/forms/submission-video-review";
import { LiveSubmissionStatus } from "@/app/submissions/live-status";
import { LocalTime } from "@/app/submissions/local-time";
import { BackToSports } from "@/components/layout/back-to-sports";
import { DevStandInPanel } from "@/components/layout/dev-standin-panel";
import { requireUser } from "@/lib/authz";
import { readCaptureAssessment } from "@/lib/capture-adherence";
import { hasReleasedMetricValue, isMetricReleased } from "@/lib/customer-metrics";
import { calculateReleasedSubmissionScore } from "@/lib/dashboard";
import { devStandInVisible, readDevStandInReport } from "@/lib/dev-standin";
import { prisma } from "@/lib/prisma";
import { formatPercent, formatSeconds } from "@/lib/utils";
import {
  canRetryProcessing,
  describeWithheldResult,
  getInProgressMessage,
  getSubmissionStatus,
  rerecordHref,
  shouldShowVideoReview,
} from "@/lib/result-presentation";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { isInFlight } from "@/lib/processing-timeline";
import { getMetricPresentation } from "@/lib/metric-presentation";

export const dynamic = "force-dynamic";

export const metadata = { title: "Submissions" };

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
  const showDevStandIn = devStandInVisible();
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
            <h1 className="athlemetry-section-heading">
              {sport ? `${SPORT_LABELS[sport]} submissions` : "Your submissions"}
            </h1>
            <p className="athlemetry-section-lead">
              Each clip shows whether it was measured. When it wasn&apos;t, we tell you why and how to re-record it.
            </p>
          </div>
          <Link href={sport ? `/submissions/new?sport=${sport}` : "/submissions/new"} className="athlemetry-button athlemetry-button-primary">
            Upload a clip
          </Link>
        </div>
      </section>

      {submissions.length === 0 ? (
        <section className="athlemetry-card p-6 md:p-8">
          <h2 className="text-lg font-semibold text-slate-950">No clips yet</h2>
          <p className="mt-2 athlemetry-body">Upload your first clip and its status will appear here.</p>
        </section>
      ) : null}

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
          const status = getSubmissionStatus({
            processingStatus: submission.processingStatus,
            captureStatus: captureAssessment?.status ?? null,
            primaryReleased,
          });
          const withheld = describeWithheldResult({
            processingStatus: submission.processingStatus,
            primaryReleased,
            assessment: captureAssessment,
            drillSlug: submission.drillDefinition.slug,
            drillName: submission.drillDefinition.name,
          });
          const inProgressMessage = getInProgressMessage(submission.processingStatus);
          const devStandInReport = showDevStandIn ? readDevStandInReport(submission.metadata) : null;
          const metricTiles = [
            isReleased("sprintTime") ? ["Sprint", formatSeconds(submission.metricResult?.sprintTime)] : null,
            isReleased("accelerationTiming") ? ["Accel", formatSeconds(submission.metricResult?.accelerationTiming)] : null,
            isReleased("changeOfDirectionMeasurement") ? ["COD", formatSeconds(submission.metricResult?.changeOfDirectionMeasurement)] : null,
            isReleased("shotTiming") ? ["Shot", formatSeconds(submission.metricResult?.shotTiming)] : null,
            primaryReleased && submission.benchmarkSnapshots ? ["Percentile", formatPercent(submission.benchmarkSnapshots.percentile)] : null,
            compositeScore !== null ? ["Composite", `${compositeScore.toFixed(1)}/100`] : null,
          ].filter((tile): tile is string[] => tile !== null);

          return (
            <article key={submission.id} className="athlemetry-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-800">
                      {submission.drillDefinition.sport}
                    </p>
                    <span className="athlemetry-chip px-3 py-1 text-xs text-slate-700">
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{submission.drillDefinition.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    <LocalTime iso={submission.submittedAt.toISOString()} label="Submitted" /> • {submission.location}
                  </p>
                </div>
              </div>

              {primaryReleased && metricTiles.length > 0 ? (
                <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {metricTiles.map(([label, value]) => (
                    <div key={label} className="athlemetry-panel-item">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">{label}</p>
                      <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {isInFlight(submission.processingStatus) ? (
                <LiveSubmissionStatus
                  submissionId={submission.id}
                  initialStatus={submission.processingStatus}
                  canPoll={submission.athleteId === user.id || user.role === "ADMIN"}
                />
              ) : inProgressMessage ? (
                <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <p>{inProgressMessage}</p>
                  {canRetryProcessing(submission.processingStatus) ? (
                    <form action={`/api/submissions/${submission.id}/retry`} method="post">
                      <button className="athlemetry-button athlemetry-button-secondary min-h-[44px] px-4 py-2 text-sm" type="submit">
                        Retry processing
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {withheld ? (
                <section className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 md:p-5" aria-labelledby={`withheld-${submission.id}`}>
                  <h2 id={`withheld-${submission.id}`} className="text-lg font-semibold tracking-tight text-amber-950">{withheld.heading}</h2>
                  <p className="mt-2">{withheld.summary}</p>
                  {withheld.primaryReason ? (
                    <div className="mt-4">
                      <p className="text-base font-semibold">{withheld.primaryReason.problem}</p>
                      <p className="mt-1">{withheld.primaryReason.fix}</p>
                    </div>
                  ) : null}
                  {withheld.otherReasons.length > 0 ? (
                    <div className="mt-4">
                      <p className="text-sm font-semibold">Also check</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {withheld.otherReasons.map((reason) => (
                          <li key={reason.code ?? "generic"}>
                            {reason.problem} {reason.fix}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link href={rerecordHref(submission.drillDefinition.slug)} className="athlemetry-button athlemetry-button-primary min-h-[44px]">
                      {withheld.kind === "not-analysable" ? "Re-record with these tips" : "Record another clip"}
                    </Link>
                    <Link href={`/protocols#${submission.drillDefinition.slug}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-800 underline underline-offset-4">
                      View the drill protocol
                    </Link>
                  </div>
                  {withheld.technicalCodes.length > 0 ? (
                    <details className="mt-4">
                      <summary className="cursor-pointer py-3 text-sm font-semibold text-amber-950">Technical details</summary>
                      <p className="mt-1 break-words font-mono text-xs">{withheld.technicalCodes.join(", ")}</p>
                    </details>
                  ) : null}
                </section>
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

              {devStandInReport ? <DevStandInPanel report={devStandInReport} /> : null}

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

              {shouldShowVideoReview({ processingStatus: submission.processingStatus, keyMomentCount: submission.reviewedKeyMoments.length })
                && submission.storageProvider && submission.storageKey && submission.videoExpiresAt && submission.videoExpiresAt > new Date() && !submission.videoDeletedAt ? (
                <SubmissionVideoReview
                  submissionId={submission.id}
                  frameRate={submission.frameRate}
                  keyMoments={submission.reviewedKeyMoments}
                />
              ) : null}

              <details className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
                <summary className="cursor-pointer py-3 text-sm font-semibold text-slate-800">
                  Report a problem with this submission
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
              {submission.athleteId === user.id ? (
                primaryReleased ? (
                  <SubmissionSharingForm submissionId={submission.id} />
                ) : (
                  <details className="mt-5">
                    <summary className="cursor-pointer py-3 text-sm font-semibold text-slate-800">
                      Sharing options
                    </summary>
                    <SubmissionSharingForm submissionId={submission.id} />
                  </details>
                )
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
