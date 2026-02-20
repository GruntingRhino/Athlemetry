import Link from "next/link";

import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">Use your Athlemetry account credentials.</p>
      <div className="mt-5">
        <LoginForm />
      </div>
      <p className="mt-4 text-sm text-slate-600">
        New user?{" "}
        <Link className="text-slate-900 underline" href="/register">
          Create an account
        </Link>
      </p>
    </div>
  );
}
