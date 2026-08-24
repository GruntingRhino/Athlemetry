import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { requirePaidFeatureAccess } from "@/lib/billing-access";
import { isMetricReleased } from "@/lib/customer-metrics";
import { prisma } from "@/lib/prisma";
import { formatPercent } from "@/lib/utils";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function BenchmarkingPage({
  searchParams,
}: {
  searchParams?: Promise<{ sport?: string }> | { sport?: string };
}) {
  const user = await requireUser();
  await requirePaidFeatureAccess(user);
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const sport = typeof resolvedSearchParams.sport === "string" && resolvedSearchParams.sport.trim() ? normalizeSport(resolvedSearchParams.sport) : null;

  const snapshots = await prisma.benchmarkSnapshot.findMany({
    where: {
      athleteId: user.id,
      ...(sport ? { submission: { drillDefinition: { sport } } } : {}),
    },
    include: {
      submission: {
        include: {
          drillDefinition: {
            include: { metricValidations: true },
          },
          metricResult: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  const releasedSnapshots = snapshots.filter((snapshot) => {
    const drill = snapshot.submission.drillDefinition;
    const modelVersion = snapshot.submission.metricResult?.metricVersion ?? "unavailable";
    const validation = drill.metricValidations.find((item) => item.metricName === drill.metricPrimaryKey && item.modelVersion === modelVersion);
    return isMetricReleased(drill.slug, drill.metricPrimaryKey, modelVersion, validation);
  });

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="max-w-3xl">
          <div className="athlemetry-kicker">{sport ? `${SPORT_LABELS[sport]} benchmarking` : "Position-based benchmarking"}</div>
          <h1 className="mt-4 athlemetry-section-heading">
            {sport ? `${SPORT_LABELS[sport]} cohort comparisons` : "Position-based benchmarking"}
          </h1>
          <p className="athlemetry-section-lead">
            {sport
              ? `Benchmarks are filtered to ${SPORT_LABELS[sport].toLowerCase()} so the cohort view stays sport-specific.`
              : "Cohorts are grouped by age, position, competition level, and gender. Benchmarks are anonymized."}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        {releasedSnapshots.length ? (
          releasedSnapshots.map((snapshot) => (
            <article key={snapshot.id} className="athlemetry-card p-5 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{snapshot.submission.drillDefinition.name}</p>
                  <p className="text-xs text-slate-500">{snapshot.cohortKey}</p>
                </div>
                <span className="athlemetry-chip border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-800">
                  {formatPercent(snapshot.percentile)}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
                <p className="athlemetry-panel-item">Relative rank: #{snapshot.relativeRank}</p>
                <p className="athlemetry-panel-item">Normalized score: {snapshot.normalizedScore.toFixed(3)}</p>
                <p className="athlemetry-panel-item">Anonymized: {snapshot.isAnonymized ? "Yes" : "No"}</p>
              </div>
            </article>
          ))
        ) : (
          <article className="athlemetry-card p-5 text-sm text-slate-600">
            No independently validated benchmark snapshots are available yet. Rankings remain disabled until the exact metric and drill protocol pass corpus, error, confidence-calibration, and independent-review gates.
          </article>
        )}
      </section>
    </div>
  );
}
