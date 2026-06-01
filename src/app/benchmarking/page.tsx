import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
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
          drillDefinition: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="space-y-5">
      <BackToSports />
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">{sport ? `${SPORT_LABELS[sport]} benchmarking` : "Position-based benchmarking"}</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {sport ? `${SPORT_LABELS[sport]} cohort comparisons` : "Position-based benchmarking"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {sport
            ? `Benchmarks are filtered to ${SPORT_LABELS[sport].toLowerCase()} so the cohort view stays sport-specific.`
            : "Cohorts are grouped by age, position, competition level, and gender. Benchmarks are anonymized."}
        </p>
      </section>

      <section className="space-y-3">
        {snapshots.length ? (
          snapshots.map((snapshot) => (
            <article key={snapshot.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{snapshot.submission.drillDefinition.name}</p>
                  <p className="text-xs text-slate-500">{snapshot.cohortKey}</p>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                  {formatPercent(snapshot.percentile)}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
                <p>Relative rank: #{snapshot.relativeRank}</p>
                <p>Normalized score: {snapshot.normalizedScore.toFixed(3)}</p>
                <p>Anonymized: {snapshot.isAnonymized ? "Yes" : "No"}</p>
              </div>
            </article>
          ))
        ) : (
          <article className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            No benchmark snapshots yet. Submit and process at least one drill first.
          </article>
        )}
      </section>
    </div>
  );
}
