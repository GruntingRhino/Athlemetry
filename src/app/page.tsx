import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Soccer Performance Intelligence Engine</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
          Standardized drill analytics for athletes, parents, and coaches.
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-600 md:text-lg">
          Upload structured drill videos, extract measurable metrics, benchmark against comparable cohorts,
          and track progress across seasons.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create account
          </Link>
          <Link
            href="/drills"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Explore drill library
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Structured Uploads",
            description:
              "Standardized drill templates, recording constraints, secure uploads, and processing status tracking.",
          },
          {
            title: "Objective Metrics",
            description:
              "Frame-based extraction pipeline for sprint, agility, shooting, dribbling, and endurance metrics.",
          },
          {
            title: "Cohort Benchmarking",
            description:
              "Age, position, level, and gender-aware percentiles with longitudinal trend visualization.",
          },
        ].map((item) => (
          <article key={item.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
