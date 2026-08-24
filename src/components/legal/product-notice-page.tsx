import Link from "next/link";

import { PRODUCT_NOTICES } from "@/lib/product-notices";

export function ProductNoticePage({ kind }: { kind: "privacy" | "terms" }) {
  const notice = PRODUCT_NOTICES[kind];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Product notice</div>
        <h1 className="mt-4 athlemetry-section-heading">{notice.title}</h1>
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-600">
          <div>
            <dt className="inline font-semibold text-slate-800">Version: </dt>
            <dd className="inline">{notice.version}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-800">Effective: </dt>
            <dd className="inline">{notice.effectiveDate}</dd>
          </div>
        </dl>
      </section>

      {notice.sections.map((section) => (
        <section key={section.heading} className="athlemetry-card p-5 md:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.heading}</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </section>
      ))}

      <p className="text-sm text-slate-600">
        <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href={kind === "privacy" ? "/terms" : "/privacy-notice"}>
          Read the {kind === "privacy" ? "Terms of Use" : "Privacy Notice"}
        </Link>
      </p>
    </div>
  );
}
