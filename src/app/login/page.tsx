import Link from "next/link";

import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Welcome back</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Sign in</h1>
        <p className="mt-3 athlemetry-body">Use your Athlemetry account credentials.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/forgot-password">
            Forgot your password?
          </Link>
        </p>
        <p className="mt-5 text-sm text-slate-600">
          New user?{" "}
          <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/register">
            Create an account
          </Link>
        </p>
        <p className="mt-3 text-sm text-slate-600">
          <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/privacy-notice">Privacy Notice</Link>
          {" · "}
          <Link className="font-semibold text-teal-800 transition hover:text-teal-900" href="/terms">Terms of Use</Link>
        </p>
      </section>
    </div>
  );
}
