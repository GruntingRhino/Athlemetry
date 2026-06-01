import Link from "next/link";

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

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-emerald-100 bg-white shadow-[0_30px_80px_-40px_rgba(16,24,16,0.35)]">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-8 md:p-12">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Multi-sport performance intelligence
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-slate-950 md:text-6xl">
              Clear video-based feedback for athletes, coaches, and parents.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              Athlemetry is built to feel premium, trustworthy, and coach-usable — not like a generic vibe-coded toy. Upload structured drill footage, get angle-aware analysis, and surface confidence notes whenever a clip is not good enough for a reliable call.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/submissions/new"
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                Upload a drill
              </Link>
              <Link
                href="/drills"
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-emerald-200 hover:bg-emerald-50"
              >
                Explore sports library
              </Link>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["Honest confidence", "If the video is not clear enough for RPM or contact-quality interpretation, the product should say that instead of guessing."],
                ["Upload-first workflow", "Athletes can submit clips from multiple angles with drill-specific guidance before any deeper tracking stack exists."],
                ["Revenue-ready polish", "Sport-specific surfaces, richer visuals, and coach-readable reporting make the product easier to demo and sell."],
              ].map(([title, body]) => (
                <article key={title} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                  <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="relative min-h-[340px] bg-slate-900">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(6, 78, 59, 0.72), rgba(15, 23, 42, 0.58)), url('https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=80')",
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)]" />
            <div className="relative flex h-full flex-col justify-end p-8 text-white">
              <div className="max-w-md rounded-[28px] border border-white/15 bg-white/10 p-5 backdrop-blur-md">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">Coach-grade product posture</p>
                <p className="mt-3 text-lg font-semibold">Premium visual system. Clear sports segmentation. Conservative analysis notes.</p>
                <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                  The product surface should make a parent or coach trust the output before they trust the algorithm.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {sports.map((sport) => (
          <article key={sport.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="h-52 bg-slate-200 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(180deg, rgba(6, 78, 59, 0.18), rgba(15, 23, 42, 0.45)), url('${sport.image}')` }} />
            <div className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-slate-950">{sport.label}</h2>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {sport.id === "basketball" ? "Baseline" : "Live"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{sport.description}</p>
              <div className="mt-5 flex gap-3">
                <Link href={`/drills#${sport.id}`} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                  Open section
                </Link>
                <Link href="/submissions/new" className="text-sm font-semibold text-slate-700 hover:text-slate-950">
                  Upload flow
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
