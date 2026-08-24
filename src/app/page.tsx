import Link from "next/link";

import { buildSportHref } from "@/lib/sport-navigation";

const sports = [
  {
    id: "soccer",
    label: "Soccer",
    description: "Structured speed, agility, striking, and consistency drills with benchmark-friendly uploads.",
    image:
      "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "baseball",
    label: "Baseball",
    description:
      "Pitching and batting workflows that prioritize honest, angle-aware analysis over fake certainty. If RPM or contact quality cannot be seen, the product should say so plainly.",
    image:
      "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "basketball",
    label: "Basketball",
    description:
      "Navigation and product surface are live now, and basketball now has baseline court-line calibration instead of a placeholder label.",
    image:
      "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80",
  },
] as const;

const sportActions = [
  { key: "uploads", label: "Uploads" },
  { key: "submissions", label: "Submissions" },
  { key: "dashboard", label: "Dashboard" },
  { key: "benchmarking", label: "Benchmarking" },
] as const;

export default function Home() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section id="sports" className="athlemetry-hero">
        <div className="relative grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative p-8 md:p-12 lg:p-14">
            <div className="athlemetry-kicker">Multi-sport performance intelligence</div>
            <h1 className="mt-6 max-w-3xl athlemetry-title">
              Clear video-based feedback for athletes, coaches, and parents.
            </h1>
            <p className="mt-6 max-w-2xl text-base md:text-lg athlemetry-body">
              Athlemetry is built to feel premium, trustworthy, and coach-usable — not like a generic vibe-coded toy.
              Upload structured drill footage, get angle-aware analysis, and surface confidence notes whenever a clip is
              not good enough for a reliable call.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={buildSportHref("uploads", "soccer")} className="athlemetry-button athlemetry-button-primary">
                Start with Soccer
              </Link>
              <Link href="/drills" className="athlemetry-button athlemetry-button-secondary">
                Explore sports library
              </Link>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ["Honest confidence", "If the video is not clear enough for RPM or contact-quality interpretation, the product should say that instead of guessing."],
                ["Sport-specific surfaces", "Soccer, baseball, and basketball each get their own uploads, submissions, dashboards, and benchmarking entry points."],
                ["Settings in one place", "Privacy and related account controls live under settings instead of cluttering the sport workflows."],
              ].map(([title, body]) => (
                <article key={title} className="athlemetry-stat">
                  <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden bg-slate-900 lg:min-h-full">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(6, 78, 59, 0.74), rgba(15, 23, 42, 0.58)), url('https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=80')",
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_35%)]" />
            <div className="relative flex h-full flex-col justify-end p-8 text-white md:p-10">
              <div className="max-w-md rounded-[28px] border border-white/15 bg-white/10 p-5 backdrop-blur-md">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">Coach-grade product posture</p>
                <p className="mt-3 text-lg font-semibold">Premium visual system. Clear sports segmentation. Conservative analysis notes.</p>
                <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                  The product surface should make a parent or coach trust the output before they trust the algorithm.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["3 sports", "Dedicated surfaces for Soccer, Baseball, and Basketball."],
          ["Conservative analysis", "Clear uncertainty when the clip is too weak to trust."],
          ["Live benchmarks", "Trends, cohorts, and percentile movement in one place."],
          ["Account controls", "Privacy, consent, and profile settings stay reachable."],
        ].map(([value, label]) => (
          <article key={value} className="athlemetry-stat">
            <p className="athlemetry-stat-label">{label}</p>
            <p className="athlemetry-stat-value text-3xl">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {sports.map((sport) => (
          <article key={sport.id} id={sport.id} className="athlemetry-card overflow-hidden scroll-mt-28">
            <div
              className="h-56 bg-cover bg-center"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.14), rgba(15, 23, 42, 0.56)), url('${sport.image}')` }}
            />
            <div className="p-6 md:p-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-950">{sport.label}</h2>
                <span className="athlemetry-chip border-teal-200 bg-teal-50 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-teal-800">
                  {sport.id === "basketball" ? "Baseline" : "Live"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{sport.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {sportActions.map((action) => (
                  <Link
                    key={action.key}
                    href={buildSportHref(action.key, sport.id)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-900"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
