import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { LogoutButton } from "@/components/layout/logout-button";

const sportLinks = [
  { href: "/drills#soccer", label: "Soccer" },
  { href: "/drills#baseball", label: "Baseball" },
  { href: "/drills#basketball", label: "Basketball" },
];

const productLinks = [
  { href: "/submissions/new", label: "Upload" },
  { href: "/submissions", label: "Submissions" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/benchmarking", label: "Benchmarking" },
];

export async function Navigation() {
  const session = await getServerSession(authOptions);

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-100/80 bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4 lg:gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-slate-950">
            {APP_NAME}
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {sportLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-transparent px-3 py-1.5 font-medium transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {productLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-transparent px-3 py-1.5 font-medium transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/privacy"
              className="rounded-full border border-transparent px-3 py-1.5 font-medium transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
            >
              Privacy
            </Link>
            {session?.user.role === "ADMIN" ? (
              <Link
                href="/admin"
                className="rounded-full border border-transparent px-3 py-1.5 font-medium transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
              >
                Admin
              </Link>
            ) : null}
          </nav>

          <div className="ml-0 flex items-center gap-3 lg:ml-4">
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
      </div>
    </header>
  );
}
