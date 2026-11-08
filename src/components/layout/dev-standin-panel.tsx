import type { DevStandInReport } from "@/lib/dev-standin";

/**
 * Developer-only panel for the stand-in analyzer. Always labelled as an
 * unvalidated opinion; rendered only when the stand-in is enabled outside
 * production (see the caller). Collapsed by default and placed below the
 * athlete-facing result by the caller.
 */
export function DevStandInPanel({ report }: { report: DevStandInReport }) {
  return (
    <details
      aria-label="Dev stand-in analysis, not validated"
      className="mt-5 rounded-[24px] border-2 border-dashed border-violet-400 bg-violet-50 p-4 text-sm leading-6 text-violet-950"
    >
      <summary className="cursor-pointer py-3 text-xs font-bold uppercase tracking-[0.18em] text-violet-800">
        Dev stand-in · experimental · not validated
      </summary>
      <p className="mt-1">{report.notice}</p>
      <dl className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">Drill shown</dt>
          <dd className="mt-1 font-semibold">{report.drillShown ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">Rough grade</dt>
          <dd className="mt-1 font-semibold">{report.grade === null ? "Not graded" : `${report.grade}/100 (opinion)`}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">Model</dt>
          <dd className="mt-1 font-semibold">{report.model ?? "unknown"}</dd>
        </div>
      </dl>
      <p className="mt-3">{report.summary}</p>
      {[
        ["Observations", report.observations],
        ["Issues", report.issues],
        ["Suggestions", report.recommendations],
      ].map(([label, items]) =>
        (items as string[]).length > 0 ? (
          <div key={label as string} className="mt-2">
            <p className="font-semibold">{label as string}</p>
            <ul className="list-disc pl-5">
              {(items as string[]).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null,
      )}
    </details>
  );
}
