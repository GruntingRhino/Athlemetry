import Link from "next/link";

import { SPORT_DESCRIPTIONS } from "@/lib/constants";
import { buildSportHref } from "@/lib/sport-navigation";

const sports = [
  {
    id: "soccer",
    label: "Soccer",
    description: SPORT_DESCRIPTIONS.soccer,
    image:
      "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "baseball",
    label: "Baseball",
    description: SPORT_DESCRIPTIONS.baseball,
    image:
      "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "basketball",
    label: "Basketball",
    description: SPORT_DESCRIPTIONS.basketball,
    image:
      "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80",
  },
] as const;

export default function Home() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section id="sports" className="athlemetry-hero">
        <div className="relative grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative p-8 md:p-12 lg:p-14">
            <h1 className="max-w-3xl athlemetry-title">
              Analyze a drill from a phone video.
            </h1>
            <p className="mt-6 max-w-2xl text-base md:text-lg athlemetry-body">
              Upload a phone video of a drill. Athlemetry checks it against the drill&apos;s capture requirements and
              reports a result only for metrics that have passed validation. If it can&apos;t report one, it tells
              you why.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/submissions/new" className="athlemetry-button athlemetry-button-primary">
                Upload a clip
              </Link>
              <Link href="/drills" className="athlemetry-button athlemetry-button-secondary">
                Browse drills
              </Link>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ["Checked against the drill", "Your recording is compared with the drill's capture requirements, such as camera view and what must stay in frame."],
                ["Results only when validated", "A metric is reported only after it has passed validation checks. Otherwise you see why it was held back."],
                ["Soccer, basketball, and baseball", "Each sport has its own drills, uploads, and submission history."],
              ].map(([title, body]) => (
                <article key={title} className="border-t border-slate-200 pt-4">
                  <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
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
                <p className="text-lg font-semibold">If a clip can&apos;t support a result, you&apos;ll see why.</p>
                <p className="mt-3 text-sm leading-6 text-emerald-50">
                  Recordings that miss a drill&apos;s capture requirements, and metrics that haven&apos;t passed validation,
                  aren&apos;t reported as results. Athlemetry gives the reason instead.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="space-y-4">
        <h2 id="how-it-works" className="text-xl font-bold tracking-tight text-slate-950">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            ["Pick a drill", "Choose a sport and a drill. Each drill has recording tips."],
            ["Record it", "Film with your phone, following the drill's capture guide."],
            ["Upload", "Send the clip. Analysis runs once the upload finishes."],
            ["Read the result", "See the result, or the reason it was held back."],
          ].map(([title, body], index) => (
            <li key={title} className="athlemetry-stat">
              <p className="text-sm font-semibold text-teal-800">Step {index + 1}</p>
              <p className="mt-1 text-lg font-bold tracking-tight text-slate-950">{title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {sports.map((sport) => (
          <article key={sport.id} id={sport.id} className="athlemetry-card overflow-hidden scroll-mt-28">
            <div
              className="h-56 bg-cover bg-center"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.14), rgba(15, 23, 42, 0.56)), url('${sport.image}')` }}
            />
            <div className="p-6 md:p-7">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">{sport.label}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">{sport.description}</p>
              <Link
                href={`${buildSportHref("drills", sport.id)}#${sport.id}`}
                className="athlemetry-button athlemetry-button-secondary mt-5 min-h-11"
              >
                Browse {sport.label.toLowerCase()} drills
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
