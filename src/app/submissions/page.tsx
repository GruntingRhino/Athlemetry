import Link from "next/link";

import { ReportForm } from "@/components/forms/report-form";
import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { calculateSubmissionScore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { formatPercent, formatSeconds } from "@/lib/utils";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";

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
      drillDefinition: true,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  return (
    <div className="space-y-5">
      <BackToSports />
      <section className="rounded-[32px] border border-emerald-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              {sport ? `${SPORT_LABELS[sport]} submissions` : "Submission archive"}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              {sport ? `${SPORT_LABELS[sport]} uploads, processing status, and analysis notes.` : "Uploads, processing status, and analysis notes."}
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              {sport
                ? `${SPORT_LABELS[sport]} submissions stay in one lane so you can jump from upload to dashboard without mixing sports.`
                : "Baseball uploads now surface explicit clarity notes instead of silently hiding what the model cannot support."}
            </p>
          </div>
          <Link
            href={sport ? `/submissions/new?sport=${sport}` : "/submissions/new"}
            className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            New submission
          </Link>
        </div>
      </section>

      <div className="space-y-4">
        {submissions.map((submission) => {
          const compositeScore = calculateSubmissionScore(submission.metricResult);
          const analysisSummary = readAnalysisSummary(submission.metadata);

          return (
            <article key={submission.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {submission.drillDefinition.sport}
                    </p>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                      {submission.processingStatus}
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{submission.drillDefinition.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {submission.submittedAt.toISOString().slice(0, 19).replace("T", " ")} • {submission.location}
                  </p>
                </div>
                <form action={`/api/submissions/${submission.id}/retry`} method="post">
                  <button
                    className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                    type="submit"
                  >
                    Retry processing
                  </button>
                </form>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-3 xl:grid-cols-6">
                <p>Sprint: {formatSeconds(submission.metricResult?.sprintTime)}</p>
                <p>Accel: {formatSeconds(submission.metricResult?.accelerationTiming)}</p>
                <p>COD: {formatSeconds(submission.metricResult?.changeOfDirectionMeasurement)}</p>
                <p>Shot: {formatSeconds(submission.metricResult?.shotTiming)}</p>
                <p>Percentile: {formatPercent(submission.benchmarkSnapshots?.percentile ?? 50)}</p>
                <p>Composite: {compositeScore !== null ? `${compositeScore.toFixed(1)}/100` : "-"}</p>
              </div>

              {analysisSummary ? (
                <div className="mt-4 rounded-[24px] border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {analysisSummary.primaryLabel ?? "Primary result"}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-950">{analysisSummary.primaryValue ?? "-"}</p>
                    </div>
                    {analysisSummary.secondaryLabel ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          {analysisSummary.secondaryLabel}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">{analysisSummary.secondaryValue ?? "-"}</p>
                      </div>
                    ) : null}
                    {analysisSummary.reliabilityLabel ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          {analysisSummary.reliabilityLabel}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">{analysisSummary.reliabilityValue ?? "-"}</p>
                      </div>
                    ) : null}
                  </div>
                  {analysisSummary.note ? (
                    <p className="mt-3 text-sm leading-6 text-slate-700">{analysisSummary.note}</p>
                  ) : null}
                  {analysisSummary.spinRateStatus?.reason ? (
                    <p className="mt-2 text-sm font-medium text-slate-700">
                      RPM: {analysisSummary.spinRateStatus.reason}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <details className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                  Report this submission
                </summary>
                <ReportForm submissionId={submission.id} />
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
