import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { LogoutButton } from "@/components/layout/logout-button";

export async function Navigation() {
  const session = await getServerSession(authOptions);

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
            {APP_NAME}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link href="/drills" className="hover:text-slate-900">
              Drills
            </Link>
            <Link href="/submissions" className="hover:text-slate-900">
              Submissions
            </Link>
            <Link href="/dashboard" className="hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/benchmarking" className="hover:text-slate-900">
              Benchmarking
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            {session?.user.role === "ADMIN" ? (
              <Link href="/admin" className="hover:text-slate-900">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {session?.user ? (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {session.user.role}
              </span>
              <Link href="/profile" className="text-sm text-slate-700 hover:text-slate-900">
                {session.user.name || session.user.email}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900">
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
