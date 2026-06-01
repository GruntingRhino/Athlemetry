import Link from "next/link";
import { getServerSession } from "next-auth";

import { LogoutButton } from "@/components/layout/logout-button";
import { APP_NAME, SPORT_LABELS, SPORT_OPTIONS } from "@/lib/constants";
import { authOptions } from "@/lib/auth";
import { buildSportHref, SPORT_SECTION_LABELS, SPORT_SETTINGS_LINKS } from "@/lib/sport-navigation";

type NavLink = {
  href: string;
  label: string;
};

function NavGroup({ label, href, links }: { label: string; href?: string; links: ReadonlyArray<NavLink> }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {href ? (
          <Link href={href} className="text-slate-500 transition hover:text-emerald-700">
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full border border-transparent bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export async function Navigation() {
  const session = await getServerSession(authOptions);

  const sportGroups = SPORT_OPTIONS.map((sport) => ({
    href: `/#${sport}`,
    label: SPORT_LABELS[sport],
    links: [
      { href: buildSportHref("uploads", sport), label: SPORT_SECTION_LABELS.uploads },
      { href: buildSportHref("submissions", sport), label: SPORT_SECTION_LABELS.submissions },
      { href: buildSportHref("dashboard", sport), label: SPORT_SECTION_LABELS.dashboard },
      { href: buildSportHref("benchmarking", sport), label: SPORT_SECTION_LABELS.benchmarking },
    ],
  }));

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-100/80 bg-white/92 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/#sports" className="text-lg font-bold tracking-tight text-slate-950">
              {APP_NAME}
            </Link>
            <Link href="/#sports" className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100">
              <span aria-hidden="true">←</span>
              Sports home
            </Link>
            {session?.user.role === "ADMIN" ? (
              <Link href="/admin" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900">
                Admin console
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            {session?.user ? (
              <>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {session.user.role}
                </span>
                <Link href="/profile" className="text-sm font-medium text-slate-700 hover:text-slate-950">
                  {session.user.name || session.user.email}
                </Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-slate-950">
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/15 transition hover:bg-emerald-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>

        <nav className="mt-4 grid gap-3 xl:grid-cols-4">
          {sportGroups.map((sport) => (
            <NavGroup key={sport.label} label={sport.label} href={sport.href} links={sport.links} />
          ))}
          <NavGroup label="Settings" links={SPORT_SETTINGS_LINKS} />
        </nav>
      </div>
    </header>
  );
}
