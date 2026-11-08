"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { resolveActiveSport, sectionForPath, type NavSectionKey } from "@/components/layout/nav-context";

export type NavSport = { id: string; label: string };
export type NavSection = { key: NavSectionKey; label: string; hrefs: Record<string, string> };

const linkBase =
  "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold transition focus-visible:outline-2 md:min-h-10 pointer-coarse:min-h-11";

export function SportNav({
  sports,
  sections,
  stacked = false,
}: {
  sports: ReadonlyArray<NavSport>;
  sections: ReadonlyArray<NavSection>;
  stacked?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSport = resolveActiveSport(searchParams.get("sport"), sports.map((sport) => sport.id));
  const activeSection = sectionForPath(pathname);
  const switchSection = sections.find((section) => section.key === (activeSection ?? "dashboard")) ?? sections[0];

  return (
    <>
      <nav aria-label="Primary">
        <ul className={stacked ? "flex flex-col gap-1" : "flex items-center gap-1"}>
          {sections.map((section) => {
            const current = section.key === activeSection;
            return (
              <li key={section.key}>
                <Link
                  href={section.hrefs[activeSport]}
                  aria-current={current ? "page" : undefined}
                  className={`${linkBase} ${stacked ? "w-full" : ""} ${
                    current ? "bg-teal-50 text-teal-900" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div role="group" aria-label="Sport" className={stacked ? "flex flex-wrap gap-2" : "flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1"}>
        {sports.map((sport) => {
          const current = sport.id === activeSport;
          return (
            <Link
              key={sport.id}
              href={switchSection.hrefs[sport.id]}
              aria-current={current ? "true" : undefined}
              className={`${linkBase} ${stacked ? "border border-slate-200" : ""} ${
                current ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {sport.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
