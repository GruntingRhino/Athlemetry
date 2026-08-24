import { SPORT_LABELS } from "@/lib/constants";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";

export default function DrillProtocolsPage() {
  const protocols = Object.entries(DRILL_PROTOCOLS);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Standardized capture</div>
        <h1 className="mt-4 athlemetry-section-heading">Drill protocols</h1>
        <p className="athlemetry-section-lead">
          Follow the exact camera, distance, repetition, and visibility requirements below. Athlemetry withholds unvalidated measurements rather than estimating outside these conditions.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {protocols.map(([slug, protocol]) => (
          <article key={slug} id={slug} className="athlemetry-card scroll-mt-28 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="athlemetry-chip">{SPORT_LABELS[protocol.sport]}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Protocol {protocol.version}</span>
            </div>
            <h2 className="mt-4 text-xl font-semibold capitalize text-slate-950">{slug.replaceAll("-", " ")}</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-900">Camera</dt><dd className="mt-1 text-slate-600">{protocol.camera.acceptedAngles.join(", ")}; full body {protocol.camera.fullBodyRequired ? "required" : "optional"}</dd></div>
              <div><dt className="font-semibold text-slate-900">Video</dt><dd className="mt-1 text-slate-600">At least {protocol.camera.minimumFps} fps</dd></div>
              <div><dt className="font-semibold text-slate-900">Reference in frame</dt><dd className="mt-1 text-slate-600">{protocol.camera.referenceInFrame}</dd></div>
              <div><dt className="font-semibold text-slate-900">Ground truth</dt><dd className="mt-1 text-slate-600">{protocol.groundTruth.equipment.join("; ")}</dd></div>
            </dl>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Required setup</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                {protocol.setup.map((step) => <li key={step}>{step}</li>)}
              </ul>
              {slug === "sprint-20m" ? (
                <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-teal-800">
                  <a href="/protocols/aruco-start-id-0.png" download>Download start marker (ID 0)</a>
                  <a href="/protocols/aruco-finish-id-1.png" download>Download finish marker (ID 1)</a>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-teal-800">
                <a href="/protocols/aruco-planar-id-10.png" download>Download planar marker ID 10</a>
                <a href="/protocols/aruco-planar-id-11.png" download>Download planar marker ID 11</a>
                <a href="/protocols/aruco-planar-id-12.png" download>Download planar marker ID 12</a>
                <a href="/protocols/aruco-planar-id-13.png" download>Download planar marker ID 13</a>
              </div>
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Execution</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
                {protocol.execution.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <h3 className="text-sm font-semibold text-rose-950">Fix recording problems before upload</h3>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-rose-950">
                {protocol.recordingErrors.map((error) => (
                  <li key={error.issue}>
                    <span className="font-semibold">If {error.issue}</span>{" "}
                    {error.correction}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              Rankings remain disabled until every displayed metric passes the corpus, ground-truth error, failure-rate, confidence-calibration, and independent-review gates.
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
