import Link from "next/link";

import { getDrillName, SPORT_LABELS, SPORT_OPTIONS } from "@/lib/constants";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { buildQuickGuideRows } from "@/lib/protocol-quick-guide";

export const metadata = { title: "Capture guide" };

export default function DrillProtocolsPage() {
  const protocols = Object.entries(DRILL_PROTOCOLS);
  const quickGuide = buildQuickGuideRows(protocols);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <h1 className="athlemetry-section-heading">Capture guide</h1>
        <p className="athlemetry-section-lead">
          Follow each drill&apos;s camera, distance, repetition, and visibility requirements. Athlemetry withholds unvalidated measurements rather than estimating outside these conditions.
        </p>
      </section>

      <section className="athlemetry-card p-6 md:p-8" aria-labelledby="quick-guide-heading">
        <h2 id="quick-guide-heading" className="text-xl font-bold tracking-tight text-slate-950">Quick guide</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
          <li>Use the camera view listed for your drill, and keep the camera fixed and steady. Don&apos;t pan or follow the athlete.</li>
          <li>Keep the whole body and the drill&apos;s reference lane or lines in frame for the entire attempt.</li>
          <li>Record at or above the minimum frame rate listed for your drill.</li>
          <li>
            Not sure which drill to pick? See the <Link href="/drills" className="font-semibold text-teal-800 underline underline-offset-4">drill list</Link>.
          </li>
        </ul>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {SPORT_OPTIONS.map((sport) => (
            <div key={sport}>
              <h3 className="text-sm font-semibold text-slate-950">{SPORT_LABELS[sport]}</h3>
              <ul className="mt-2 space-y-3 text-sm leading-6 text-slate-700">
                {quickGuide
                  .filter((row) => row.sport === sport)
                  .map((row) => (
                    <li key={row.slug}>
                      <a href={`#${row.slug}`} className="font-semibold text-teal-800 underline underline-offset-4">
                        {getDrillName(row.slug)}
                      </a>
                      <span className="block">
                        {row.view} view, at least {row.minimumFps} fps{row.fullBodyRequired ? ", full body in frame" : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {protocols.map(([slug, protocol]) => (
          <article key={slug} id={slug} className="athlemetry-card scroll-mt-28 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="athlemetry-chip">{SPORT_LABELS[protocol.sport]}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Protocol {protocol.version}</span>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-950">{getDrillName(slug)}</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-900">Camera</dt><dd className="mt-1 text-slate-700">{protocol.camera.acceptedAngles.join(", ")}; full body {protocol.camera.fullBodyRequired ? "required" : "optional"}</dd></div>
              <div><dt className="font-semibold text-slate-900">Video</dt><dd className="mt-1 text-slate-700">At least {protocol.camera.minimumFps} fps</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-900">Reference in frame</dt><dd className="mt-1 text-slate-700">{protocol.camera.referenceInFrame}</dd></div>
            </dl>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Execution</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
                {protocol.execution.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Fix recording problems before upload</h3>
              <ul className="mt-2 space-y-3 text-sm leading-6 text-slate-700">
                {protocol.recordingErrors.map((error) => (
                  <li key={error.issue}>
                    <span className="font-semibold text-slate-900">If {error.issue}</span>{" "}
                    {error.correction}
                  </li>
                ))}
              </ul>
            </div>
            <details className="mt-5 border-t border-slate-200 pt-4">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold text-teal-800">
                Full capture protocol (coaches and validation sessions)
              </summary>
              <div className="mt-3">
                <h3 className="text-sm font-semibold text-slate-900">Required setup</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {protocol.setup.map((step) => <li key={step}>{step}</li>)}
                </ul>
                {slug === "sprint-20m" ? (
                  <div className="mt-3 flex flex-wrap gap-x-4 text-sm font-semibold text-teal-800">
                    <a className="inline-flex min-h-11 items-center" href="/protocols/aruco-start-id-0.png" download>Download start marker (ID 0)</a>
                    <a className="inline-flex min-h-11 items-center" href="/protocols/aruco-finish-id-1.png" download>Download finish marker (ID 1)</a>
                  </div>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-x-4 text-sm font-semibold text-teal-800">
                  <a className="inline-flex min-h-11 items-center" href="/protocols/aruco-planar-id-10.png" download>Download planar marker ID 10</a>
                  <a className="inline-flex min-h-11 items-center" href="/protocols/aruco-planar-id-11.png" download>Download planar marker ID 11</a>
                  <a className="inline-flex min-h-11 items-center" href="/protocols/aruco-planar-id-12.png" download>Download planar marker ID 12</a>
                  <a className="inline-flex min-h-11 items-center" href="/protocols/aruco-planar-id-13.png" download>Download planar marker ID 13</a>
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-semibold text-slate-900">Ground truth</h3>
                <p className="mt-1 text-sm leading-6 text-slate-700">{protocol.groundTruth.equipment.join("; ")}</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-700">
                Rankings remain disabled until every displayed metric passes the corpus, ground-truth error, failure-rate, confidence-calibration, and independent-review gates.
              </p>
            </details>
          </article>
        ))}
      </section>
    </div>
  );
}
