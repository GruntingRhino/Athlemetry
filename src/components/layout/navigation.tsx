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
    <div className="athlemetry-card-soft p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-400">
        {href ? (
          <Link href={href} className="transition hover:text-teal-700">
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
            className="rounded-full border border-transparent bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-900"
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
    <header className="sticky top-0 z-50 border-b border-white/70 bg-white/80 backdrop-blur-xl">
      <div className="athlemetry-shell py-3 lg:py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/#sports"
              className="athlemetry-chip border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900"
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
              {APP_NAME}
            </Link>
            <Link
              href="/#sports"
              className="athlemetry-button athlemetry-button-secondary px-4 py-2 text-sm"
            >
              <span aria-hidden="true">←</span>
              Sports home
            </Link>
            {session?.user.role === "ADMIN" ? (
              <Link href="/admin" className="athlemetry-button athlemetry-button-secondary px-4 py-2 text-sm">
                Admin console
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            {session?.user ? (
              <>
                <span className="athlemetry-chip border-teal-200 bg-teal-50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-teal-800">
                  {session.user.role}
                </span>
                <Link href="/profile" className="text-sm font-semibold text-slate-700 transition hover:text-slate-950">
                  {session.user.name || session.user.email}
                </Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-semibold text-slate-700 transition hover:text-slate-950">
                  Login
                </Link>
                <Link href="/register" className="athlemetry-button athlemetry-button-primary px-4 py-2 text-sm">
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
          <NavGroup
            label="Settings"
            links={SPORT_SETTINGS_LINKS.filter((link) => {
              if (link.href === "/teams") return session?.user?.role === "COACH" || session?.user?.role === "ADMIN";
              if (link.href === "/team-invitations") return session?.user?.role === "ATHLETE";
              return true;
            })}
          />
        </nav>
      </div>
    </header>
  );
}
