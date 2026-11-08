import Link from "next/link";
import { getServerSession } from "next-auth";
import { Suspense } from "react";

import { LogoutButton } from "@/components/layout/logout-button";
import { NavDisclosure } from "@/components/layout/nav-disclosure";
import { SportNav, type NavSection } from "@/components/layout/nav-links";
import { APP_NAME, SPORT_LABELS, SPORT_OPTIONS } from "@/lib/constants";
import { authOptions } from "@/lib/auth";
import { buildSportHref, getSectionPath, getSettingsGroups, SPORT_SECTION_LABELS, type SportSectionKey } from "@/lib/sport-navigation";

const SECTION_ORDER: ReadonlyArray<SportSectionKey> = ["dashboard", "drills", "uploads", "submissions"];

const menuLink =
  "flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950";

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  );
}

const summaryStyle =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 md:min-h-10 pointer-coarse:min-h-11";

type SessionUser = { name?: string | null; email?: string | null; role?: string | null };

function AccountLinks({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-sm text-slate-700">
        <span className="font-semibold text-slate-950">{user.name || user.email}</span>
        <span className="ml-2 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-900">
          {user.role}
        </span>
      </p>
      {user.role === "ADMIN" ? (
        <Link href="/admin" className={menuLink}>
          Admin console
        </Link>
      ) : null}
      {getSettingsGroups(user.role).map((group) => (
        <nav key={group.heading} aria-label={group.heading} className="pt-1">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{group.heading}</p>
          <ul className="space-y-0.5">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={menuLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <div className="border-t border-slate-200 pt-2">
        <LogoutButton />
      </div>
    </div>
  );
}

export async function Navigation() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  const sports = SPORT_OPTIONS.map((sport) => ({ id: sport, label: SPORT_LABELS[sport] }));
  const sections: NavSection[] = SECTION_ORDER.map((key) => ({
    key,
    label: SPORT_SECTION_LABELS[key],
    href: getSectionPath(key),
    // The drill list is one page grouped by sport, so a sport-scoped link also jumps to that group.
    hrefs: Object.fromEntries(
      SPORT_OPTIONS.map((sport) => [sport, `${buildSportHref(key, sport)}${key === "drills" ? `#${sport}` : ""}`]),
    ),
  }));

  const brand = (
    <Link
      href={user ? "/dashboard" : "/"}
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-base font-bold text-teal-900"
    >
      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-teal-600" aria-hidden="true" />
      {APP_NAME}
    </Link>
  );

  const signedOutLinks = (
    <>
      <Link href="/login" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-slate-700 transition hover:text-slate-950">
        Login
      </Link>
      <Link href="/register" className="athlemetry-button athlemetry-button-primary min-h-11 px-4 py-2 text-sm">
        Register
      </Link>
    </>
  );

  return (
    <header className="relative z-50 border-b border-slate-200 bg-white/95 backdrop-blur md:sticky md:top-0">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-3 px-3 py-1 md:min-h-16 md:gap-5 md:px-4">
        {brand}

        {user ? (
          <>
            {/* Desktop: compact single row */}
            <div className="hidden min-w-0 flex-1 items-center gap-4 md:flex">
              <Suspense
                fallback={
                  // Same links without sport/active state, so the nav is in the server HTML
                  // (useSearchParams in SportNav suspends until hydration).
                  <nav aria-label="Primary">
                    <ul className="flex items-center gap-1">
                      {sections.map((section) => (
                        <li key={section.key}>
                          <Link
                            href={section.href}
                            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-700"
                          >
                            {section.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                }
              >
                <SportNav sports={sports} sections={sections} />
              </Suspense>
            </div>
            <div className="relative ml-auto hidden md:block">
              <NavDisclosure
                summary={
                  <>
                    <span className="max-w-40 truncate">{user.name || user.email}</span>
                    <Chevron />
                  </>
                }
                summaryClassName={summaryStyle}
              >
                <div className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <AccountLinks user={user} />
                </div>
              </NavDisclosure>
            </div>

            {/* Mobile: brand + Menu sheet that can never outgrow the viewport */}
            <div className="ml-auto md:hidden">
              <NavDisclosure
                summary={
                  <>
                    <MenuIcon />
                    Menu
                  </>
                }
                summaryClassName={summaryStyle}
              >
                <div className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-3.5rem)] space-y-4 overflow-y-auto border-b border-slate-200 bg-white p-3 shadow-xl">
                  <Suspense fallback={null}>
                    <SportNav sports={sports} sections={sections} stacked />
                  </Suspense>
                  <div className="border-t border-slate-200 pt-3">
                    <AccountLinks user={user} />
                  </div>
                </div>
              </NavDisclosure>
            </div>
          </>
        ) : (
          <div className="ml-auto flex items-center gap-2">{signedOutLinks}</div>
        )}
      </div>
    </header>
  );
}
